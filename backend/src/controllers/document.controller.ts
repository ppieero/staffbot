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

// DELETE /api/documents/:id
export async function deleteDocument(req: Request, res: Response): Promise<void> {
  const result = await svc.deleteDocument(tenantId(req), req.params.id);
  if (!result) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ data: result, meta: { message: "Document deleted and vector removal queued" } });
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
