import { Request, Response } from "express";
import { validationResult } from "express-validator";
import * as svc from "../services/tenant.service";

function parseIntParam(val: unknown, fallback: number): number {
  const n = parseInt(String(val), 10);
  return isNaN(n) ? fallback : n;
}

// GET /api/tenants
export async function listTenants(req: Request, res: Response): Promise<void> {
  const page = parseIntParam(req.query.page, 1);
  const limit = Math.min(parseIntParam(req.query.limit, 20), 100);
  const search = req.query.search as string | undefined;

  const result = await svc.getTenants({ page, limit, search });
  res.json(result);
}

// POST /api/tenants
export async function createTenant(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return;
  }

  try {
    const result = await svc.createTenant(req.body);
    res.status(201).json({ data: result });
  } catch (err: any) {
    // PostgreSQL unique constraint violation (error may be wrapped in cause)
    const pgError = err?.cause || err;
    if (pgError?.code === "23505") {
      const detail = pgError?.detail || "";
      if (detail.includes("email")) {
        res.status(409).json({ error: "A user with this email already exists" });
        return;
      }
      if (detail.includes("slug")) {
        res.status(409).json({ error: "A company with this slug already exists" });
        return;
      }
      res.status(409).json({ error: "Duplicate entry - value already exists" });
      return;
    }
    console.error("[createTenant] unexpected error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// GET /api/tenants/:id
export async function getTenant(req: Request, res: Response): Promise<void> {
  const [tenant, stats] = await Promise.all([
    svc.getTenantById(req.params.id),
    svc.getTenantStats(req.params.id),
  ]);

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json({ data: { ...tenant, stats } });
}

// PUT /api/tenants/:id
export async function updateTenant(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return;
  }

  const updated = await svc.updateTenant(req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json({ data: updated });
}

// DELETE /api/tenants/:id
export async function deleteTenant(req: Request, res: Response): Promise<void> {
  const result = await svc.deleteTenant(req.params.id);
  if (!result) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json({ data: result, meta: { message: "Tenant suspended (soft delete)" } });
}

// GET /api/tenants/:id/stats
export async function getTenantStats(req: Request, res: Response): Promise<void> {
  const tenant = await svc.getTenantById(req.params.id);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const stats = await svc.getTenantStats(req.params.id);
  res.json({ data: stats });
}
