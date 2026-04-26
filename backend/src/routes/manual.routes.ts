import { Router, Request, Response } from "express";
import multer from "multer";
import { db } from "../db/index.js";
import { manuals, manualSections, tenants } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import { generateManual, generateManualFromVideo } from "../services/manual-generator.service.js";
import { transcribeVideo } from "../services/video-transcription.service.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const router      = Router();
const upload      = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const uploadVideo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

function resolveTenantId(req: Request): string | null {
  const user = req.user!;
  return user.role === "company_admin"
    ? (user as any).tenantId
    : (req.query.tenantId as string) || null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function uploadToMinio(
  buffer: Buffer,
  filename: string,
  tenantId: string,
): Promise<string> {
  const s3 = new S3Client({
    endpoint:    process.env.AWS_ENDPOINT_URL ?? "http://localhost:9000",
    region:      process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID ?? "staffbot",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "staffbot123",
    },
    forcePathStyle: true,
  });
  const key    = `${tenantId}/manuals/${randomUUID()}/${filename}`;
  const bucket = process.env.AWS_S3_BUCKET ?? "staffbot-docs";
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer }));
  const publicBase = (process.env.MINIO_PUBLIC_URL ?? "http://localhost:9000").replace(/\/$/, "");
  return `${publicBase}/${key}`;
}

// GET /api/manuals — list manuals for tenant (includes tenantSlug for link building)
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const rows = await db
      .select({
        id:             manuals.id,
        tenantId:       manuals.tenantId,
        tenantSlug:     tenants.slug,
        title:          manuals.title,
        slug:           manuals.slug,
        status:         manuals.status,
        language:       manuals.language,
        sourceType:     manuals.sourceType,
        sourceFileUrl:  manuals.sourceFileUrl,
        sourceFileName: manuals.sourceFileName,
        videoUrl:       manuals.videoUrl,
        videoDuration:  manuals.videoDuration,
        profileIds:     manuals.profileIds,
        generatedAt:    manuals.generatedAt,
        createdAt:      manuals.createdAt,
        updatedAt:      manuals.updatedAt,
      })
      .from(manuals)
      .innerJoin(tenants, eq(manuals.tenantId, tenants.id))
      .where(tenantId ? eq(manuals.tenantId, tenantId) : undefined as any)
      .orderBy(desc(manuals.createdAt));
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/manuals/public/:tenantSlug/:manualSlug — public viewer, no auth
// Must be declared BEFORE /:id to avoid matching "public" as an id
router.get("/public/:tenantSlug/:manualSlug", async (req: Request, res: Response) => {
  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, req.params.tenantSlug))
      .limit(1);
    if (!tenant) return res.status(404).json({ error: "Not found" });

    const [manual] = await db
      .select()
      .from(manuals)
      .where(
        and(
          eq(manuals.tenantId, tenant.id),
          eq(manuals.slug, req.params.manualSlug),
        ),
      )
      .limit(1);
    if (!manual || manual.status !== "published")
      return res.status(404).json({ error: "Manual not found or not published" });

    const sections = await db
      .select()
      .from(manualSections)
      .where(eq(manualSections.manualId, manual.id))
      .orderBy(manualSections.orderIndex);

    res.json({ ...manual, sections, tenantName: tenant.name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/manuals/:id — get manual with sections
router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const [manual] = await db
      .select()
      .from(manuals)
      .where(eq(manuals.id, req.params.id))
      .limit(1);
    if (!manual) return res.status(404).json({ error: "Manual not found" });

    const sections = await db
      .select()
      .from(manualSections)
      .where(eq(manualSections.manualId, manual.id))
      .orderBy(manualSections.orderIndex);

    res.json({ ...manual, sections });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manuals/upload — upload PDF and trigger async generation
router.post(
  "/upload",
  authenticate,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const user     = req.user!;
      const tenantId = (user as any).role === "company_admin"
        ? (user as any).tenantId
        : req.body.tenantId;
      if (!tenantId) return res.status(400).json({ error: "tenantId required" });

      const title      = (req.body.title as string | undefined)?.trim()
        || req.file.originalname.replace(/\.[^/.]+$/, "");
      const baseSlug   = slugify(title);
      const profileIds = req.body.profileIds ? JSON.parse(req.body.profileIds) : [];

      // Upload source file to MinIO (best-effort)
      const fileUrl = await uploadToMinio(
        req.file.buffer,
        req.file.originalname,
        tenantId,
      ).catch((e: any) => {
        console.warn("[manual] MinIO upload skipped:", e?.message);
        return "";
      });

      const [manual] = await db.insert(manuals).values({
        tenantId,
        title,
        slug:           `${baseSlug}-${Date.now()}`,
        status:         "pending",
        sourceFileUrl:  fileUrl,
        sourceFileName: req.file.originalname,
        profileIds,
      }).returning();

      // Capture buffer before setImmediate (req.file is gone after response)
      const fileBuffer   = req.file.buffer;
      const fileMimetype = req.file.mimetype;
      const fileOrigname = req.file.originalname;

      setImmediate(async () => {
        try {
          // Try RAG engine for text extraction
          const { default: FormData } = await import("form-data");
          const form = new FormData();
          form.append("file", fileBuffer, {
            filename:    fileOrigname,
            contentType: fileMimetype,
          });
          form.append("tenant_id",   tenantId);
          form.append("document_id", manual.id);

          let pdfText = "";
          try {
            const ragRes = await fetch(
              `${process.env.RAG_ENGINE_URL ?? "http://localhost:8000"}/extract-text`,
              { method: "POST", body: form as any, headers: form.getHeaders() },
            );
            if (ragRes.ok) {
              const data = await ragRes.json() as { text?: string };
              pdfText = data.text ?? "";
            }
          } catch (e: any) {
            console.warn("[manual] RAG extract-text failed:", e?.message);
          }

          if (!pdfText) {
            pdfText = `Document: ${fileOrigname}\nPlease create a comprehensive manual based on the document title and typical content for this type of document.`;
          }

          await generateManual(manual.id, pdfText, title);
        } catch (err: any) {
          console.error("[manual] async generation error:", err?.message);
        }
      });

      res.status(201).json({
        id:      manual.id,
        status:  "pending",
        title,
        message: "Manual generation started",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// POST /api/manuals/upload-video — upload video, transcribe with Whisper, generate SOP
router.post(
  "/upload-video",
  authenticate,
  uploadVideo.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No video file uploaded" });

      const user     = req.user!;
      const tenantId = (user as any).role === "company_admin"
        ? (user as any).tenantId
        : req.body.tenantId;
      if (!tenantId) return res.status(400).json({ error: "tenantId required" });

      const ACCEPTED_TYPES = [
        "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/mpeg",
        "audio/mpeg", "audio/mp4", "audio/wav", "audio/webm",
      ];
      if (!ACCEPTED_TYPES.includes(req.file.mimetype)) {
        return res.status(400).json({
          error: `Unsupported file type: ${req.file.mimetype}. Use MP4, MOV, WebM, AVI, or audio files.`,
        });
      }

      const title    = ((req.body.title as string | undefined)?.trim()) || req.file.originalname.replace(/\.[^/.]+$/, "");
      const baseSlug = slugify(title);

      // Upload video to MinIO (best-effort)
      const videoUrl = await uploadToMinio(req.file.buffer, req.file.originalname, tenantId).catch((e: any) => {
        console.warn("[manual-video] MinIO upload skipped:", e?.message);
        return "";
      });

      const [manual] = await db.insert(manuals).values({
        tenantId,
        title,
        slug:           `${baseSlug}-${Date.now()}`,
        status:         "transcribing" as any,
        sourceType:     "video",
        videoUrl,
        sourceFileUrl:  videoUrl,
        sourceFileName: req.file.originalname,
        profileIds:     [],
      }).returning();

      const fileBuffer = req.file.buffer;
      const fileName   = req.file.originalname;

      setImmediate(async () => {
        try {
          console.log(`[manual-video] Starting transcription for ${manual.id}`);
          const transcription = await transcribeVideo(fileBuffer, fileName);
          console.log(`[manual-video] Transcription done: ${transcription.text.length} chars, lang: ${transcription.language}`);

          await db.update(manuals).set({
            transcription:  transcription.text,
            videoDuration:  Math.round(transcription.duration),
            language:       transcription.language,
            status:         "generating",
            updatedAt:      new Date(),
          }).where(eq(manuals.id, manual.id));

          await generateManualFromVideo(manual.id, transcription, title, transcription.duration);
          console.log(`[manual-video] Manual generated for ${manual.id}`);
        } catch (err: any) {
          console.error("[manual-video] error:", err?.message);
          await db.update(manuals).set({ status: "error", updatedAt: new Date() }).where(eq(manuals.id, manual.id));
        }
      });

      res.status(201).json({
        id:      manual.id,
        status:  "transcribing",
        title,
        message: "Video uploaded — transcription started. Check back in 2-3 minutes.",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// DELETE /api/manuals/:id
router.delete("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const user     = req.user!;
    const [manual] = await db
      .select()
      .from(manuals)
      .where(eq(manuals.id, req.params.id))
      .limit(1);
    if (!manual) return res.status(404).json({ error: "Not found" });
    if (
      (user as any).role !== "super_admin" &&
      manual.tenantId !== (user as any).tenantId
    )
      return res.status(403).json({ error: "Forbidden" });

    await db.delete(manuals).where(eq(manuals.id, req.params.id));
    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
