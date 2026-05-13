import { Router, Request, Response } from "express";
import multer from "multer";
import { db } from "../db/index.js";
import { manuals, manualSections, tenants, positionProfiles } from "../db/schema.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import { generateManual, generateManualFromVideo, generateManualFaithful } from "../services/manual-generator.service.js";
import { indexManual, deindexManual } from "../services/manual-indexer.service.js";
import { cleanupManual } from "../lib/storage-cleanup.js";
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
        ragIndexed:     manuals.ragIndexed,
        ragChunks:      manuals.ragChunks,
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

      const title          = (req.body.title as string | undefined)?.trim()
        || req.file.originalname.replace(/\.[^/.]+$/, "");
      const targetLanguage = (req.body.language as string | undefined) ?? "auto";
      const baseSlug       = slugify(title);
      const profileIds     = req.body.profileIds ? JSON.parse(req.body.profileIds) : [];

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
        language:       targetLanguage === "auto" ? null : targetLanguage,
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
          console.log(`[manual] Extracting text from "${fileOrigname}" (${fileMimetype})`);

          // Use native FormData + Blob — works correctly with Node 18+ native fetch
          const form = new FormData();
          form.append("file", new Blob([fileBuffer], { type: fileMimetype }), fileOrigname);
          form.append("tenant_id",   tenantId);
          form.append("document_id", manual.id);

          let pdfText = "";
          let extractedImages: Array<{ url: string; index: number; page?: number | null; ext?: string }> = [];
          try {
            const ragRes = await fetch(
              `${process.env.RAG_ENGINE_URL ?? "http://localhost:8000"}/extract-text`,
              { method: "POST", body: form },
            );
            if (ragRes.ok) {
              const data = await ragRes.json() as { text?: string; images?: Array<{ url: string; index?: number; page?: number | null; ext?: string }>; error?: string };
              pdfText = data.text ?? "";
              extractedImages = (data.images ?? []).map((img, i) => ({
                url:   img.url,
                index: img.index ?? i,
                page:  img.page ?? null,
                ext:   img.ext ?? "",
              }));
              if (data.error) console.warn("[manual] RAG extract warning:", data.error);
              console.log(`[manual] Extracted ${pdfText.length} chars, ${extractedImages.length} images from ${fileOrigname}`);
            } else {
              const errBody = await ragRes.text().catch(() => "");
              console.warn(`[manual] RAG extract-text ${ragRes.status}: ${errBody.slice(0, 200)}`);
            }
          } catch (e: any) {
            console.warn("[manual] RAG extract-text failed:", e?.message);
          }

          if (!pdfText || pdfText.trim().length < 30) {
            console.warn("[manual] Falling back to title-only prompt for", fileOrigname);
            pdfText = `Document title: ${title}\nFile: ${fileOrigname}\n\nCreate a comprehensive professional manual based on the document title and context.`;
          }

          await generateManual(manual.id, pdfText, title, targetLanguage, extractedImages);
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

// POST /api/manuals/upload-faithful — slide-faithful manual (PDF/PPTX/ODP — no AI rewriting)
router.post(
  "/upload-faithful",
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

      const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "";
      if (!["pdf", "pptx", "ppt", "odp"].includes(ext)) {
        return res.status(400).json({ error: "Unsupported file type. Use PDF, PPTX, PPT, or ODP." });
      }

      const title    = (req.body.title as string | undefined)?.trim()
        || req.file.originalname.replace(/\.[^/.]+$/, "");
      const baseSlug = slugify(title);
      const profileIds = req.body.profileIds ? JSON.parse(req.body.profileIds) : [];

      const fileUrl = await uploadToMinio(req.file.buffer, req.file.originalname, tenantId)
        .catch((e: any) => { console.warn("[manual-faithful] MinIO upload skipped:", e?.message); return ""; });

      const [manual] = await db.insert(manuals).values({
        tenantId,
        title,
        slug:           `${baseSlug}-${Date.now()}`,
        status:         "pending",
        sourceFileUrl:  fileUrl,
        sourceFileName: req.file.originalname,
        profileIds,
      }).returning();

      const fileBuffer   = req.file.buffer;
      const fileMimetype = req.file.mimetype;
      const fileOrigname = req.file.originalname;

      setImmediate(async () => {
        try {
          await generateManualFaithful(manual.id, fileBuffer, fileOrigname, fileMimetype, title, tenantId);
        } catch (err: any) {
          console.error("[manual-faithful] async error:", err?.message);
        }
      });

      res.status(201).json({
        id:      manual.id,
        status:  "pending",
        title,
        message: "Faithful manual generation started",
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

      const title          = ((req.body.title as string | undefined)?.trim()) || req.file.originalname.replace(/\.[^/.]+$/, "");
      const targetLanguage = (req.body.language as string | undefined) ?? "auto";
      const baseSlug       = slugify(title);

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

          await generateManualFromVideo(manual.id, transcription, title, transcription.duration, targetLanguage);
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

// GET /api/manuals/:id/available-images — list all images extracted from the source document
router.get("/:id/available-images", authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const [manual] = await db.select().from(manuals).where(eq(manuals.id, req.params.id)).limit(1);
    if (!manual) return res.status(404).json({ error: "Manual not found" });
    if (user.role !== "super_admin" && manual.tenantId !== user.tenantId)
      return res.status(403).json({ error: "Forbidden" });
    res.json({ images: manual.availableImages ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/manuals/:id/sections/:sectionId/images — update images for a single section
router.patch("/:id/sections/:sectionId/images", authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { images } = req.body;

    if (!Array.isArray(images))
      return res.status(400).json({ error: "images must be an array" });

    const [manual] = await db.select().from(manuals).where(eq(manuals.id, req.params.id)).limit(1);
    if (!manual) return res.status(404).json({ error: "Manual not found" });
    if (user.role !== "super_admin" && manual.tenantId !== user.tenantId)
      return res.status(403).json({ error: "Forbidden" });

    const [section] = await db
      .select()
      .from(manualSections)
      .where(and(eq(manualSections.id, req.params.sectionId), eq(manualSections.manualId, req.params.id)))
      .limit(1);
    if (!section) return res.status(404).json({ error: "Section not found" });

    await db.update(manualSections)
      .set({ images: images as any, updatedAt: new Date() })
      .where(eq(manualSections.id, req.params.sectionId));

    if (manual.ragIndexed) {
      const { indexManual } = await import("../services/manual-indexer.service.js");
      indexManual(req.params.id).catch((e: any) =>
        console.warn("[manual] re-index after image edit failed:", e?.message)
      );
    }

    res.json({ id: req.params.sectionId, images });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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

    // Clean Qdrant vectors + MinIO images before deleting from postgres
    await cleanupManual(req.params.id, manual.tenantId).catch((e: any) =>
      console.warn("[manual] cleanup on delete failed:", e?.message)
    );
    await db.delete(manuals).where(eq(manuals.id, req.params.id));
    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/manuals/:id/profile-assignment
router.patch("/:id/profile-assignment", authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { profileIds } = req.body;

    if (!Array.isArray(profileIds) || profileIds.length === 0)
      return res.status(400).json({ error: "profileIds must be a non-empty array" });

    const [manual] = await db.select().from(manuals).where(eq(manuals.id, req.params.id)).limit(1);
    if (!manual) return res.status(404).json({ error: "Manual not found" });
    if (user.role !== "super_admin" && manual.tenantId !== user.tenantId)
      return res.status(403).json({ error: "Forbidden" });

    const profiles = await db
      .select({ id: positionProfiles.id })
      .from(positionProfiles)
      .where(and(
        eq(positionProfiles.tenantId, manual.tenantId),
        inArray(positionProfiles.id, profileIds),
      ));

    if (profiles.length !== profileIds.length)
      return res.status(400).json({ error: "One or more profiles do not belong to this company" });

    await db.update(manuals)
      .set({ profileIds, updatedAt: new Date() })
      .where(eq(manuals.id, req.params.id));

    if (manual.ragIndexed) {
      indexManual(req.params.id).catch((e: any) =>
        console.warn("[manual] re-index after profile change failed:", e?.message)
      );
    }

    res.json({ id: req.params.id, profileIds });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manuals/:id/index
router.post("/:id/index", authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const [manual] = await db.select().from(manuals).where(eq(manuals.id, req.params.id)).limit(1);
    if (!manual) return res.status(404).json({ error: "Manual not found" });
    if (user.role !== "super_admin" && manual.tenantId !== user.tenantId)
      return res.status(403).json({ error: "Forbidden" });
    if (manual.status !== "published")
      return res.status(400).json({ error: "Manual must be published before indexing" });

    const { chunks } = await indexManual(manual.id);
    res.json({ success: true, chunks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/manuals/:id/index
router.delete("/:id/index", authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const [manual] = await db.select().from(manuals).where(eq(manuals.id, req.params.id)).limit(1);
    if (!manual) return res.status(404).json({ error: "Manual not found" });
    if (user.role !== "super_admin" && manual.tenantId !== user.tenantId)
      return res.status(403).json({ error: "Forbidden" });

    await deindexManual(manual.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/manuals/:id/index-images — toggle image indexing
router.patch("/:id/index-images", authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { indexImages } = req.body as { indexImages?: unknown };

    if (typeof indexImages !== "boolean")
      return res.status(400).json({ error: "indexImages must be boolean" });

    const [manual] = await db
      .select({ id: manuals.id, tenantId: manuals.tenantId, status: manuals.status })
      .from(manuals)
      .where(eq(manuals.id, req.params.id))
      .limit(1);

    if (!manual) return res.status(404).json({ error: "Manual not found" });
    if ((user as any).role !== "super_admin" && manual.tenantId !== (user as any).tenantId)
      return res.status(403).json({ error: "Forbidden" });

    await db.update(manuals)
      .set({ indexImages, updatedAt: new Date() })
      .where(eq(manuals.id, manual.id));

    if (!indexImages) {
      const { deleteImagesFromMinIO } = await import("../lib/storage-cleanup.js");
      await deleteImagesFromMinIO(manual.tenantId, manual.id).catch((e: any) =>
        console.warn("[manual] MinIO delete failed:", e?.message)
      );
      await db.update(manualSections)
        .set({ images: [] as any })
        .where(eq(manualSections.manualId, manual.id));
    }

    if (manual.status === "published") {
      indexManual(manual.id).catch((e: any) =>
        console.warn("[manual] Re-index after image toggle failed:", e?.message)
      );
    }

    res.json({ data: { id: manual.id, indexImages } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manuals/:id/sections/:sectionId/move-image — move image to another section
router.post("/:id/sections/:sectionId/move-image", authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { imageIndex, targetSectionId } = req.body as { imageIndex?: unknown; targetSectionId?: unknown };

    if (imageIndex === undefined || !targetSectionId)
      return res.status(400).json({ error: "imageIndex and targetSectionId are required" });

    const [manual] = await db.select({ id: manuals.id, tenantId: manuals.tenantId, status: manuals.status })
      .from(manuals).where(eq(manuals.id, req.params.id)).limit(1);
    if (!manual) return res.status(404).json({ error: "Manual not found" });
    if (user.role !== "super_admin" && manual.tenantId !== user.tenantId)
      return res.status(403).json({ error: "Forbidden" });

    const [srcSection] = await db.select().from(manualSections)
      .where(and(eq(manualSections.id, req.params.sectionId), eq(manualSections.manualId, req.params.id))).limit(1);
    if (!srcSection) return res.status(404).json({ error: "Source section not found" });

    const [tgtSection] = await db.select().from(manualSections)
      .where(and(eq(manualSections.id, targetSectionId as string), eq(manualSections.manualId, req.params.id))).limit(1);
    if (!tgtSection) return res.status(404).json({ error: "Target section not found" });

    const srcImages = (srcSection.images as any[]) ?? [];
    const tgtImages = (tgtSection.images as any[]) ?? [];

    const imgToMove = srcImages.find((img: any) => img.index === imageIndex);
    if (!imgToMove) return res.status(404).json({ error: "Image not found in source section" });

    const newSrcImages = srcImages.filter((img: any) => img.index !== imageIndex);
    const newTgtImages = [...tgtImages, imgToMove].slice(0, 3);

    await db.update(manualSections).set({ images: newSrcImages as any }).where(eq(manualSections.id, srcSection.id));
    await db.update(manualSections).set({ images: newTgtImages as any }).where(eq(manualSections.id, tgtSection.id));

    indexManual(manual.id).catch((e: any) => console.warn("[manual] re-index after image move failed:", e?.message));

    res.json({
      moved:         true,
      imageIndex,
      fromSection:   srcSection.id,
      toSection:     tgtSection.id,
      srcImageCount: newSrcImages.length,
      tgtImageCount: newTgtImages.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/manuals/:id/sections/:sectionId — update section content
router.put("/:id/sections/:sectionId", authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { title, contentHtml, sectionType } = req.body;

    const [manual] = await db.select({ tenantId: manuals.tenantId, status: manuals.status })
      .from(manuals).where(eq(manuals.id, req.params.id)).limit(1);
    if (!manual) return res.status(404).json({ error: "Manual not found" });
    if (user.role !== "super_admin" && manual.tenantId !== user.tenantId)
      return res.status(403).json({ error: "Forbidden" });

    const updates: any = { updatedAt: new Date() };
    if (title !== undefined)       updates.title       = title;
    if (contentHtml !== undefined) updates.contentHtml = contentHtml;
    if (sectionType !== undefined) updates.sectionType = sectionType;

    const [updated] = await db.update(manualSections)
      .set(updates)
      .where(and(eq(manualSections.id, req.params.sectionId), eq(manualSections.manualId, req.params.id)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Section not found" });

    indexManual(req.params.id).catch((e: any) =>
      console.warn("[manual] re-index after section edit failed:", e?.message)
    );

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manuals/:id/sections — add new section
router.post("/:id/sections", authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { title, contentHtml, sectionType, insertAfterIndex } = req.body;

    if (!title) return res.status(400).json({ error: "title is required" });

    const [manual] = await db.select({ tenantId: manuals.tenantId })
      .from(manuals).where(eq(manuals.id, req.params.id)).limit(1);
    if (!manual) return res.status(404).json({ error: "Manual not found" });
    if (user.role !== "super_admin" && manual.tenantId !== user.tenantId)
      return res.status(403).json({ error: "Forbidden" });

    const existing = await db.select({ id: manualSections.id, orderIndex: manualSections.orderIndex })
      .from(manualSections).where(eq(manualSections.manualId, req.params.id))
      .orderBy(manualSections.orderIndex);

    const insertAt = insertAfterIndex !== undefined
      ? Math.min(insertAfterIndex + 1, existing.length)
      : existing.length;

    for (const sec of existing.slice(insertAt)) {
      await db.update(manualSections)
        .set({ orderIndex: sec.orderIndex + 1 })
        .where(eq(manualSections.id, sec.id));
    }

    const [created] = await db.insert(manualSections).values({
      manualId:    req.params.id,
      orderIndex:  insertAt,
      title,
      contentHtml: contentHtml ?? `<p class="sb-section-body">${title}</p>`,
      sectionType: sectionType ?? "content",
      images:      [],
    }).returning();

    indexManual(req.params.id).catch(() => {});
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/manuals/:id/sections/:sectionId — delete a section
router.delete("/:id/sections/:sectionId", authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const [manual] = await db.select({ tenantId: manuals.tenantId })
      .from(manuals).where(eq(manuals.id, req.params.id)).limit(1);
    if (!manual) return res.status(404).json({ error: "Manual not found" });
    if (user.role !== "super_admin" && manual.tenantId !== user.tenantId)
      return res.status(403).json({ error: "Forbidden" });

    const count = await db.select({ id: manualSections.id })
      .from(manualSections).where(eq(manualSections.manualId, req.params.id));
    if (count.length <= 1)
      return res.status(400).json({ error: "Cannot delete the last section" });

    await db.delete(manualSections)
      .where(and(
        eq(manualSections.id, req.params.sectionId),
        eq(manualSections.manualId, req.params.id)
      ));

    const remaining = await db.select({ id: manualSections.id })
      .from(manualSections).where(eq(manualSections.manualId, req.params.id))
      .orderBy(manualSections.orderIndex);
    for (let i = 0; i < remaining.length; i++) {
      await db.update(manualSections)
        .set({ orderIndex: i })
        .where(eq(manualSections.id, remaining[i].id));
    }

    indexManual(req.params.id).catch(() => {});
    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/manuals/:id/sections/reorder — reorder all sections
router.patch("/:id/sections/reorder", authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { sectionIds } = req.body;

    if (!Array.isArray(sectionIds))
      return res.status(400).json({ error: "sectionIds must be an array" });

    const [manual] = await db.select({ tenantId: manuals.tenantId })
      .from(manuals).where(eq(manuals.id, req.params.id)).limit(1);
    if (!manual) return res.status(404).json({ error: "Manual not found" });
    if (user.role !== "super_admin" && manual.tenantId !== user.tenantId)
      return res.status(403).json({ error: "Forbidden" });

    for (let i = 0; i < sectionIds.length; i++) {
      await db.update(manualSections)
        .set({ orderIndex: i })
        .where(and(
          eq(manualSections.id, sectionIds[i]),
          eq(manualSections.manualId, req.params.id)
        ));
    }

    indexManual(req.params.id).catch(() => {});
    res.json({ reordered: true, count: sectionIds.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manuals/:id/sections/:sectionId/regenerate — AI regenerate section
router.post("/:id/sections/:sectionId/regenerate", authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { instruction } = req.body;

    if (!instruction) return res.status(400).json({ error: "instruction is required" });

    const [manual] = await db.select({ tenantId: manuals.tenantId, language: manuals.language })
      .from(manuals).where(eq(manuals.id, req.params.id)).limit(1);
    if (!manual) return res.status(404).json({ error: "Manual not found" });
    if (user.role !== "super_admin" && manual.tenantId !== user.tenantId)
      return res.status(403).json({ error: "Forbidden" });

    const [section] = await db.select()
      .from(manualSections)
      .where(and(eq(manualSections.id, req.params.sectionId), eq(manualSections.manualId, req.params.id)))
      .limit(1);
    if (!section) return res.status(404).json({ error: "Section not found" });

    const plainContent = section.contentHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const langNames: Record<string, string> = { es: "Spanish", en: "English", fr: "French", pt: "Portuguese" };
    const lang = manual.language ?? "en";

    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 2000,
      system:     `You are editing a section of a professional operational manual. Write in ${langNames[lang] ?? lang}. Respond ONLY with a JSON object, no markdown, no preamble.`,
      messages: [{
        role:    "user",
        content: `Current section title: "${section.title}"
Current section type: ${section.sectionType}
Current content: ${plainContent}

User instruction: "${instruction}"

Apply the instruction and return the updated section as JSON:
{"title":"updated or same title","type":"intro|steps|checklist|note|warning|content","content":"main paragraph text","steps":["step 1"],"checklist":["item 1"],"notes":["note 1"],"warning":"safety warning if applicable"}

Only include arrays relevant to the section type. Return valid JSON only.`,
      }],
    });

    const rawText = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const cleaned = rawText.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const generated = JSON.parse(cleaned);

    let html = `<p class="sb-section-body">${generated.content ?? ""}</p>`;
    if (generated.warning) {
      html = `<div class="sb-warning"><span class="sb-warning-icon">⚠</span><div><strong>Safety Warning</strong><p>${generated.warning}</p></div></div>` + html;
    }
    if (generated.steps?.length) {
      html += `<ol class="sb-steps">${generated.steps.map((s: string, i: number) =>
        `<li class="sb-step"><span class="sb-step-num">${i+1}</span><span class="sb-step-text">${s}</span></li>`
      ).join("")}</ol>`;
    }
    if (generated.checklist?.length) {
      html += `<ul class="sb-checklist">${generated.checklist.map((s: string) =>
        `<li class="sb-check"><span class="sb-check-box"></span><span style="color:#1a1a1a">${s}</span></li>`
      ).join("")}</ul>`;
    }
    if (generated.notes?.length) {
      html += generated.notes.map((n: string) =>
        `<div class="sb-note"><span class="sb-note-label">Note</span><p>${n}</p></div>`
      ).join("");
    }

    const [updated] = await db.update(manualSections)
      .set({
        title:       generated.title ?? section.title,
        contentHtml: html,
        sectionType: generated.type ?? section.sectionType,
      })
      .where(eq(manualSections.id, section.id))
      .returning();

    indexManual(req.params.id).catch(() => {});
    res.json({ ...updated, generatedContent: generated });
  } catch (err: any) {
    console.error("[manual] regenerate error:", err?.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
