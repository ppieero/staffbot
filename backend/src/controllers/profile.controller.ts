import { Request, Response } from "express";
import { validationResult } from "express-validator";
import * as svc from "../services/profile.service";

function parseIntParam(val: unknown, fallback: number): number {
  const n = parseInt(String(val), 10);
  return isNaN(n) ? fallback : n;
}

/**
 * Resolves the effective tenantId for scoping queries.
 * - company_admin/viewer: always their own tenant
 * - super_admin: reads ?tenantId= from query (or body for mutations); null = all tenants
 */
function resolveTenantId(req: Request, fromBody = false): string | null {
  const user = req.user!;
  if (user.role !== "super_admin") return user.tenantId!;
  const override = fromBody
    ? (req.body.tenantId as string | undefined)
    : (req.query.tenantId as string | undefined);
  return override ?? null;
}

// GET /api/profiles
export async function listProfiles(req: Request, res: Response): Promise<void> {
  const page = parseIntParam(req.query.page, 1);
  const limit = Math.min(parseIntParam(req.query.limit, 20), 100);
  const search = req.query.search as string | undefined;

  const result = await svc.getProfiles(resolveTenantId(req), { page, limit, search });
  res.json(result);
}

// POST /api/profiles
export async function createProfile(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return;
  }

  const user = req.user!;
  let tenantId: string;

  if (user.role === "super_admin") {
    tenantId = req.body.tenantId;
    if (!tenantId) {
      res.status(422).json({ error: "tenantId is required for super_admin" });
      return;
    }
  } else {
    tenantId = user.tenantId!;
  }

  const profile = await svc.createProfile(tenantId, req.body);
  res.status(201).json({ data: profile });
}

// GET /api/profiles/:id
export async function getProfile(req: Request, res: Response): Promise<void> {
  const [profile, stats] = await Promise.all([
    svc.getProfileById(resolveTenantId(req), req.params.id),
    svc.getProfileStats(resolveTenantId(req), req.params.id),
  ]);

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json({ data: { ...profile, stats } });
}

// PUT /api/profiles/:id
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return;
  }

  const updated = await svc.updateProfile(resolveTenantId(req), req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json({ data: updated });
}

// DELETE /api/profiles/:id
export async function deleteProfile(req: Request, res: Response): Promise<void> {
  try {
    const result = await svc.deleteProfile(resolveTenantId(req), req.params.id);
    if (!result) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    res.json({ data: result, meta: { message: "Profile deleted" } });
  } catch (err: any) {
    res.status(409).json({ error: err.message });
  }
}

// PATCH /api/profiles/:id/status
export async function patchProfileStatus(req: Request, res: Response): Promise<void> {
  const { status } = req.body as { status?: string };

  if (status !== "active" && status !== "inactive") {
    res.status(422).json({ error: "status must be 'active' or 'inactive'" });
    return;
  }

  const updated = await svc.setProfileStatus(resolveTenantId(req), req.params.id, status);
  if (!updated) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json({ data: updated });
}
