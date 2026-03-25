import { and, count, desc, eq, SQL } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { documents } from "../db/schema";
import { uploadFile, deleteFile } from "../lib/s3";
import { documentIndexQueue, documentDeleteQueue } from "../lib/queue";

// ─── Types ────────────────────────────────────────────────────────────────────

type FileType = "pdf" | "docx" | "txt" | "xlsx";
type IndexingStatus = "pending" | "processing" | "indexed" | "error";

export interface DocumentPagination {
  page?: number;
  limit?: number;
  profileId?: string;
  status?: IndexingStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MIME_TO_TYPE: Record<string, FileType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "docx",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
};

const EXT_TO_TYPE: Record<string, FileType> = {
  pdf: "pdf",
  docx: "docx",
  doc: "docx",
  txt: "txt",
  xlsx: "xlsx",
  xls: "xlsx",
};

function detectFileType(mimetype: string, filename: string): FileType {
  if (MIME_TO_TYPE[mimetype]) return MIME_TO_TYPE[mimetype];
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_TYPE[ext] ?? "txt";
}

/** Reconstruct the S3 key from document fields (avoids storing it separately). */
function s3Key(doc: { tenantId: string; profileId: string; id: string; fileName: string }) {
  return `${doc.tenantId}/${doc.profileId}/${doc.id}/${doc.fileName}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function uploadDocument(
  tenantId: string,
  profileId: string,
  userId: string,
  file: Express.Multer.File,
  name: string
) {
  const documentId = uuidv4();
  const fileType = detectFileType(file.mimetype, file.originalname);
  const key = `${tenantId}/${profileId}/${documentId}/${file.originalname}`;

  const fileUrl = await uploadFile(key, file.buffer, file.mimetype);

  const [doc] = await db
    .insert(documents)
    .values({
      id: documentId,
      tenantId,
      profileId,
      name,
      fileName: file.originalname,
      fileUrl,
      fileType,
      fileSizeBytes: file.size,
      indexingStatus: "pending",
      uploadedBy: userId,
      version: 1,
    })
    .returning();

  // Publish indexing job with 3 retries + exponential backoff
  await documentIndexQueue.add(
    "index",
    { documentId, tenantId, profileId, fileUrl, fileType },
    { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
  );

  return doc;
}

export async function getDocuments(
  tenantId: string | null,
  { page = 1, limit = 20, profileId, status }: DocumentPagination
) {
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];
  if (tenantId) conditions.push(eq(documents.tenantId, tenantId));
  if (profileId) conditions.push(eq(documents.profileId, profileId));
  if (status) conditions.push(eq(documents.indexingStatus, status));

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(where)
      .orderBy(desc(documents.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(documents).where(where),
  ]);

  return {
    data: rows,
    meta: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
    },
  };
}

export async function getDocumentById(tenantId: string | null, id: string) {
  const conditions: SQL[] = [eq(documents.id, id)];
  if (tenantId) conditions.push(eq(documents.tenantId, tenantId));
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(...conditions))
    .limit(1);
  return doc ?? null;
}

export async function deleteDocument(tenantId: string | null, id: string) {
  const doc = await getDocumentById(tenantId, id);
  if (!doc) return null;

  // Delete from S3
  await deleteFile(s3Key(doc));

  // Queue vector deletion (RAG engine will remove from Qdrant)
  await documentDeleteQueue.add("delete", {
    documentId: id,
    tenantId,
    vectorIds: [], // RAG engine queries by document_id payload filter
  });

  // Delete from DB (use the resolved doc.tenantId so the WHERE clause is always correct)
  const [deleted] = await db
    .delete(documents)
    .where(and(eq(documents.id, id), eq(documents.tenantId, doc.tenantId)))
    .returning({ id: documents.id });

  return deleted ?? null;
}

export async function updateIndexingStatus(
  documentId: string,
  status: IndexingStatus,
  chunkCount?: number,
  errorMessage?: string
) {
  const [updated] = await db
    .update(documents)
    .set({
      indexingStatus: status,
      ...(chunkCount !== undefined ? { chunkCount } : {}),
      ...(errorMessage !== undefined ? { errorMessage } : {}),
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId))
    .returning();
  return updated ?? null;
}

export async function reindexDocument(tenantId: string | null, id: string) {
  const doc = await getDocumentById(tenantId, id);
  if (!doc) return null;

  await updateIndexingStatus(id, "pending", undefined, undefined);

  await documentIndexQueue.add(
    "index",
    {
      documentId: id,
      tenantId,
      profileId: doc.profileId,
      fileUrl: doc.fileUrl,
      fileType: doc.fileType,
    },
    { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
  );

  return doc;
}
