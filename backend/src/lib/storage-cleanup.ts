import { deleteFolder } from "./s3.js";

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const COLLECTION = "staffbot_openai";

async function qdrantDelete(filter: object): Promise<void> {
  await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ filter }),
  });
}

/** Delete all Qdrant vectors for a document. */
export async function deleteDocumentVectors(documentId: string): Promise<void> {
  await qdrantDelete({ must: [{ key: "document_id", match: { value: documentId } }] });
  console.log(`[cleanup] Deleted Qdrant vectors for document ${documentId}`);
}

/** Delete all Qdrant vectors for a manual. */
export async function deleteManualVectors(manualId: string): Promise<void> {
  await qdrantDelete({ must: [{ key: "manual_id", match: { value: manualId } }] });
  console.log(`[cleanup] Deleted Qdrant vectors for manual ${manualId}`);
}

/** Delete extracted images from MinIO. Path: {tenantId}/{sourceId}/images/ */
export async function deleteImagesFromMinIO(tenantId: string, sourceId: string): Promise<number> {
  try {
    const count = await deleteFolder(`${tenantId}/${sourceId}/images/`);
    if (count) console.log(`[cleanup] Deleted ${count} images from MinIO for ${sourceId}`);
    return count;
  } catch (err: any) {
    console.warn(`[cleanup] MinIO image cleanup failed for ${sourceId}:`, err?.message);
    return 0;
  }
}

/** Full cleanup for a document: Qdrant vectors + MinIO images. */
export async function cleanupDocument(documentId: string, tenantId: string): Promise<void> {
  await Promise.allSettled([
    deleteDocumentVectors(documentId),
    deleteImagesFromMinIO(tenantId, documentId),
  ]);
}

/** Full cleanup for a manual: Qdrant vectors + MinIO images. */
export async function cleanupManual(manualId: string, tenantId: string): Promise<void> {
  await Promise.allSettled([
    deleteManualVectors(manualId),
    deleteImagesFromMinIO(tenantId, manualId),
  ]);
}
