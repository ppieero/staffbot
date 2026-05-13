/**
 * Daily cleanup job — runs at 3am to purge orphaned Qdrant vectors and
 * MinIO images that no longer have a corresponding document/manual in postgres.
 */
import { db } from "../db/index.js";
import { documents, manuals } from "../db/schema.js";
import { deleteDocumentVectors, deleteManualVectors, deleteImagesFromMinIO } from "../lib/storage-cleanup.js";
import { deleteFolder } from "../lib/s3.js";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const COLLECTION = "staffbot_openai";

async function getQdrantSourceIds(): Promise<Map<string, "document" | "manual">> {
  const ids = new Map<string, "document" | "manual">();
  let offset: string | undefined;

  while (true) {
    const payload: any = { limit: 100, with_payload: true };
    if (offset) payload.offset = offset;

    const res  = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const data = await res.json() as any;
    const pts  = data?.result?.points ?? [];
    if (!pts.length) break;

    for (const p of pts) {
      const pl = p.payload ?? {};
      if (pl.document_id) ids.set(pl.document_id, "document");
      if (pl.manual_id)   ids.set(pl.manual_id,   "manual");
    }

    offset = data?.result?.next_page_offset;
    if (!offset) break;
  }

  return ids;
}

export async function runDailyCleanup(): Promise<{ orphanedVectors: number; orphanedImages: number }> {
  console.log("[cleanup-job] Starting daily cleanup...");
  let orphanedVectors = 0;
  let orphanedImages  = 0;

  try {
    const [docs, mans] = await Promise.all([
      db.select({ id: documents.id, tenantId: documents.tenantId }).from(documents),
      db.select({ id: manuals.id,   tenantId: manuals.tenantId   }).from(manuals),
    ]);

    const validDocIds = new Map(docs.map(d => [d.id, d.tenantId]));
    const validManIds = new Map(mans.map(m => [m.id, m.tenantId]));
    const allValidIds = new Set([...validDocIds.keys(), ...validManIds.keys()]);

    // 1. Purge orphaned Qdrant vectors
    const qdrantIds = await getQdrantSourceIds();
    for (const [id, type] of qdrantIds) {
      if (!allValidIds.has(id)) {
        console.log(`[cleanup-job] Orphaned ${type} vector: ${id}`);
        if (type === "document") await deleteDocumentVectors(id).catch(() => {});
        if (type === "manual")   await deleteManualVectors(id).catch(() => {});
        orphanedVectors++;
      }
    }

    // 2. Purge orphaned MinIO image folders
    const s3 = new S3Client({
      endpoint:  process.env.AWS_ENDPOINT_URL ?? "http://localhost:9000",
      region:    process.env.AWS_REGION ?? "us-east-1",
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID ?? "staffbot",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "staffbot123",
      },
      forcePathStyle: true,
    });

    const bucket  = process.env.AWS_S3_BUCKET ?? "staffbot-docs";
    const listed  = await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 }));
    const objects = listed.Contents ?? [];

    // Extract unique source IDs from MinIO paths: {tenantId}/{sourceId}/images/*
    const minioSources = new Map<string, string>(); // sourceId → tenantId
    for (const obj of objects) {
      const parts = obj.Key?.split("/") ?? [];
      if (parts.length >= 3 && parts[2] === "images") {
        minioSources.set(parts[1], parts[0]);
      }
    }

    for (const [sourceId, tenantId] of minioSources) {
      if (!allValidIds.has(sourceId)) {
        const count = await deleteImagesFromMinIO(tenantId, sourceId).catch(() => 0);
        if (count) {
          console.log(`[cleanup-job] Deleted ${count} orphaned images for ${sourceId}`);
          orphanedImages += count;
        }
      }
    }

    console.log(`[cleanup-job] Done — orphaned vectors: ${orphanedVectors}, orphaned images: ${orphanedImages}`);
  } catch (err: any) {
    console.error("[cleanup-job] Error:", err?.message);
  }

  return { orphanedVectors, orphanedImages };
}

export function scheduleDailyCleanup(): void {
  const MS_PER_HOUR = 3_600_000;
  const MS_PER_DAY  = 24 * MS_PER_HOUR;

  function msUntil3am(): number {
    const now  = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  setTimeout(() => {
    runDailyCleanup();
    setInterval(runDailyCleanup, MS_PER_DAY);
  }, msUntil3am());

  console.log(`[cleanup-job] Scheduled — next run in ${Math.round(msUntil3am() / MS_PER_HOUR)}h`);
}
