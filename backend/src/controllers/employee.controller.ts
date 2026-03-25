import { Request, Response } from "express";
import { validationResult } from "express-validator";
import * as svc from "../services/employee.service";
import { sendVerificationMessage } from "../services/whatsapp-verification.service";
import { sendWelcomeMessage } from "../services/welcome.service";

function tenantId(req: Request): string | null {
  return req.user!.tenantId ?? null;
}

/** For create operations: super_admin supplies tenantId in body; company_admin uses JWT. */
function resolveTenantId(req: Request): string | null {
  if (req.user!.role === "super_admin") {
    return (req.body.tenantId as string) || null;
  }
  return req.user!.tenantId ?? null;
}

function parseIntParam(val: unknown, fallback: number): number {
  const n = parseInt(String(val), 10);
  return isNaN(n) ? fallback : n;
}

// GET /api/employees
export async function listEmployees(req: Request, res: Response): Promise<void> {
  const page = parseIntParam(req.query.page, 1);
  const limit = Math.min(parseIntParam(req.query.limit, 20), 100);

  const result = await svc.getEmployees(tenantId(req), {
    page,
    limit,
    search: req.query.search as string | undefined,
    profileId: req.query.profileId as string | undefined,
    status: req.query.status as svc.EmployeeFilters["status"],
  });
  res.json(result);
}

// POST /api/employees
export async function createEmployee(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return;
  }

  const tid = resolveTenantId(req);
  if (!tid) {
    res.status(422).json({ error: "tenantId is required when creating as super_admin" });
    return;
  }

  try {
    const employee = await svc.createEmployee(tid, req.body);
    // Fire-and-forget — don't fail the create if messaging not configured
    if (employee.phoneWhatsapp) {
      sendVerificationMessage(employee.id).catch((e) =>
        console.warn("[employee] verification send failed:", e?.message)
      );
    }
    sendWelcomeMessage(employee.id).catch((e) =>
      console.warn("[employee] welcome send failed:", e?.message)
    );
    res.status(201).json({ data: employee });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Phone number already registered" });
      return;
    }
    console.error("createEmployee error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// POST /api/employees/bulk
export async function bulkCreateEmployees(
  req: Request,
  res: Response
): Promise<void> {
  const { employees: rows } = req.body as {
    employees?: svc.CreateEmployeeInput[];
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(422).json({ error: "employees array is required and must not be empty" });
    return;
  }

  try {
    const created = await svc.bulkCreateEmployees(tenantId(req), rows);
    res.status(201).json({
      data: created,
      meta: { created: created.length },
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "One or more phone numbers already registered" });
      return;
    }
    res.status(400).json({ error: err.message });
  }
}

// GET /api/employees/:id
export async function getEmployee(req: Request, res: Response): Promise<void> {
  const employee = await svc.getEmployeeById(tenantId(req), req.params.id);
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  res.json({ data: employee });
}

// PUT /api/employees/:id
export async function updateEmployee(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return;
  }

  const updated = await svc.updateEmployee(tenantId(req), req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  res.json({ data: updated });
}

// PATCH /api/employees/:id/status
export async function patchEmployeeStatus(
  req: Request,
  res: Response
): Promise<void> {
  const { status } = req.body as { status?: string };
  const valid = ["active", "inactive", "onboarding"];

  if (!status || !valid.includes(status)) {
    res.status(422).json({ error: `status must be one of: ${valid.join(", ")}` });
    return;
  }

  const updated = await svc.setEmployeeStatus(
    tenantId(req),
    req.params.id,
    status as "active" | "inactive" | "onboarding"
  );
  if (!updated) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  res.json({ data: updated });
}
