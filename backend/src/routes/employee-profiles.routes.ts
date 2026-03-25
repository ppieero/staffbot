import { Router, Request, Response } from "express";
import { db } from "../db";
import { employeeProfiles, positionProfiles, employees } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { requireCompanyAdmin } from "../middleware/requireRole";
import { createTelegramGroup } from "../services/telegram-group.service";

const router = Router();
router.use(authenticate, requireCompanyAdmin);

/** Returns the employee if it belongs to the requesting user's tenant. 403 otherwise. */
async function resolveEmployee(req: Request, res: Response): Promise<{ id: string; firstName: string; lastName: string; telegramUserId: string | null; tenantId: string } | null> {
  const user = (req as any).user;
  const [employee] = await db
    .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, telegramUserId: employees.telegramUserId, tenantId: employees.tenantId })
    .from(employees)
    .where(eq(employees.id, req.params.id))
    .limit(1);

  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return null;
  }
  if (user.role !== "super_admin" && employee.tenantId !== user.tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return employee;
}

// GET /api/employees/:id/profiles
router.get("/:id/profiles", async (req: Request, res: Response) => {
  try {
    const employee = await resolveEmployee(req, res);
    if (!employee) return;

    const rows = await db
      .select({
        id:                employeeProfiles.id,
        profileId:         employeeProfiles.profileId,
        profileName:       positionProfiles.name,
        profileLanguage:   positionProfiles.language,
        isPrimary:         employeeProfiles.isPrimary,
        telegramGroupId:   employeeProfiles.telegramGroupId,
        telegramGroupName: employeeProfiles.telegramGroupName,
        assignedAt:        employeeProfiles.assignedAt,
      })
      .from(employeeProfiles)
      .innerJoin(positionProfiles, eq(employeeProfiles.profileId, positionProfiles.id))
      .where(eq(employeeProfiles.employeeId, employee.id));

    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees/:id/profiles — assign a profile to an employee
router.post("/:id/profiles", async (req: Request, res: Response) => {
  try {
    const { profileId, isPrimary } = req.body;
    if (!profileId) {
      res.status(400).json({ error: "profileId is required" });
      return;
    }

    const user = (req as any).user;
    const employee = await resolveEmployee(req, res);
    if (!employee) return;

    const [profile] = await db
      .select({ id: positionProfiles.id, name: positionProfiles.name, tenantId: positionProfiles.tenantId })
      .from(positionProfiles)
      .where(eq(positionProfiles.id, profileId))
      .limit(1);
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    // Ensure the profile belongs to the same tenant as the employee
    if (user.role !== "super_admin" && profile.tenantId !== user.tenantId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    // If setting as primary, unset all existing primaries first
    if (isPrimary) {
      await db.update(employeeProfiles)
        .set({ isPrimary: false })
        .where(eq(employeeProfiles.employeeId, employee.id));
    }

    // Notify employee via Telegram if linked
    let telegramGroupId: number | null = null;
    let telegramGroupName: string | null = null;

    if (employee.telegramUserId) {
      const groupName = `${profile.name} — ${employee.firstName} ${employee.lastName}`;
      const result = await createTelegramGroup(groupName, parseInt(employee.telegramUserId));
      if (result.success && result.groupId) {
        telegramGroupId   = result.groupId;
        telegramGroupName = groupName;
        console.log(`[ep] notified via Telegram: ${groupName} (${result.groupId})`);
      } else {
        console.warn(`[ep] Telegram notification failed: ${result.reason}`);
      }
    }

    const [assignment] = await db
      .insert(employeeProfiles)
      .values({
        employeeId: employee.id,
        profileId,
        isPrimary:         isPrimary ?? false,
        telegramGroupId:   telegramGroupId ?? undefined,
        telegramGroupName: telegramGroupName ?? undefined,
      })
      .onConflictDoUpdate({
        target: [employeeProfiles.employeeId, employeeProfiles.profileId],
        set: {
          isPrimary:         isPrimary ?? false,
          ...(telegramGroupId   ? { telegramGroupId }   : {}),
          ...(telegramGroupName ? { telegramGroupName } : {}),
        },
      })
      .returning();

    res.status(201).json({
      data: assignment,
      telegramGroup: telegramGroupId
        ? { created: true, groupId: telegramGroupId, groupName: telegramGroupName }
        : { created: false, reason: employee.telegramUserId ? "Telegram notification failed" : "Employee has no Telegram ID" },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employees/:id/profiles/:profileId
router.delete("/:id/profiles/:profileId", async (req: Request, res: Response) => {
  try {
    const employee = await resolveEmployee(req, res);
    if (!employee) return;

    await db.delete(employeeProfiles).where(
      and(
        eq(employeeProfiles.employeeId, employee.id),
        eq(employeeProfiles.profileId, req.params.profileId),
      )
    );
    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/employees/:id/profiles/:profileId/primary
router.patch("/:id/profiles/:profileId/primary", async (req: Request, res: Response) => {
  try {
    const employee = await resolveEmployee(req, res);
    if (!employee) return;

    await db.update(employeeProfiles).set({ isPrimary: false }).where(eq(employeeProfiles.employeeId, employee.id));
    await db.update(employeeProfiles).set({ isPrimary: true }).where(
      and(
        eq(employeeProfiles.employeeId, employee.id),
        eq(employeeProfiles.profileId, req.params.profileId),
      )
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
