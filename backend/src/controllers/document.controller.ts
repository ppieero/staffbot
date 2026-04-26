import { Request, Response } from "express";
import * as svc from "../services/document.service";
import { getProfileById } from "../services/profile.service";

function tenantId(req: Request): string | null {
  return req.user!.tenantId ?? null;
}

/** Resolves the effective tenantId for document operations.
 *  - company_admin/viewer: always their own tenantId from JWT
 *  - super_admin: tenantId is null in JWT, so we look it up from the profile
 */
async function resolveTenantId(req: Request, profileId: string): Promise<string | null> {
  if (req.user!.role !== "super_admin") return req.user!.tenantId;
  const profile = await getProfileById(null, profileId);
  return profile?.tenantId ?? null;
}

function parseIntParam(val: unknown, fallback: number): number {
  const n = parseInt(String(val), 10);
  return isNaN(n) ? fallback : n;
}

// GET /api/documents
export async function listDocuments(req: Request, res: Response): Promise<void> {
  const result = await svc.getDocuments(tenantId(req), {
    page: parseIntParam(req.query.page, 1),
    limit: Math.min(parseIntParam(req.query.limit, 20), 100),
    profileId: req.query.profileId as string | undefined,
    status: req.query.status as any,
  });
  res.json(result);
}

// POST /api/documents/upload (multipart)
export async function uploadDocument(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(422).json({ error: "No file uploaded or unsupported file type" });
    return;
  }

  const { profileId, name } = req.body as { profileId?: string; name?: string };

  if (!profileId) {
    res.status(422).json({ error: "profileId is required" });
    return;
  }

  const tid = await resolveTenantId(req, profileId);
  if (!tid) {
    res.status(422).json({ error: "Could not resolve tenantId — profile not found" });
    return;
  }

  const doc = await svc.uploadDocument(
    tid,
    profileId,
    req.user!.sub,
    req.file,
    name ?? req.file.originalname
  );

  res.status(201).json({ data: doc });
}

// GET /api/documents/:id
export async function getDocument(req: Request, res: Response): Promise<void> {
  const doc = await svc.getDocumentById(tenantId(req), req.params.id);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ data: doc });
}

// GET /api/documents/:id/download — streams file from MinIO through the backend
export async function downloadDocument(req: Request, res: Response): Promise<void> {
  const doc = await svc.getDocumentById(tenantId(req), req.params.id);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  if (!doc.fileUrl) {
    res.status(404).json({ error: "File URL not available" });
    return;
  }
  try {
    // Fetch from internal MinIO URL (server-side, no CORS/hostname issues)
    const minioRes = await fetch(doc.fileUrl);
    if (!minioRes.ok) {
      res.status(502).json({ error: `MinIO fetch failed: ${minioRes.status}` });
      return;
    }
    const filename = encodeURIComponent(doc.fileName ?? doc.name);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", minioRes.headers.get("content-type") ?? "application/octet-stream");
    const contentLength = minioRes.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    // Stream body to client
    const { Readable } = await import("stream");
    Readable.fromWeb(minioRes.body as any).pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/documents/:id
export async function deleteDocument(req: Request, res: Response): Promise<void> {
  const result = await svc.deleteDocument(tenantId(req), req.params.id);
  if (!result) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ data: result, meta: { message: "Document deleted and vector removal queued" } });
}

// POST /api/documents/reindex-all
export async function reindexAllDocuments(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  if (user.role !== "super_admin" && user.role !== "company_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const tid = user.role === "company_admin" ? user.tenantId : ((req.body.tenantId as string) ?? null);
  const queued = await svc.reindexAllDocuments(tid);
  res.json({ queued: queued.length, documents: queued });
}

// POST /api/documents/:id/reindex
export async function reindexDocument(req: Request, res: Response): Promise<void> {
  const result = await svc.reindexDocument(tenantId(req), req.params.id);
  if (!result) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ data: result, meta: { message: "Reindex job queued" } });
}

// PATCH /api/documents/:id/profile-assignment
export async function patchProfileAssignment(req: Request, res: Response): Promise<void> {
  const { profileIds } = req.body as { profileIds?: string[] };

  if (!Array.isArray(profileIds) || profileIds.length === 0) {
    res.status(422).json({ error: "profileIds must be a non-empty array" });
    return;
  }

  const updated = await svc.updateProfileAssignment(tenantId(req), req.params.id, profileIds);
  if (!updated) {
    res.status(404).json({ error: "Document not found or profiles invalid" });
    return;
  }
  res.json({ data: updated });
}

// PATCH /api/documents/:id/status  (internal — called by worker)
export async function patchDocumentStatus(req: Request, res: Response): Promise<void> {
  const { status, chunkCount, errorMessage } = req.body as {
    status: string;
    chunkCount?: number;
    errorMessage?: string;
  };

  const valid = ["pending", "processing", "indexed", "error"];
  if (!valid.includes(status)) {
    res.status(422).json({ error: `status must be one of: ${valid.join(", ")}` });
    return;
  }

  const updated = await svc.updateIndexingStatus(
    req.params.id,
    status as any,
    chunkCount,
    errorMessage
  );

  if (!updated) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ data: updated });
}
