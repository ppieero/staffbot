import { Router, Request, Response } from "express";
import { eq, desc, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { users, auditLogs } from "../db/schema";
import { authenticate } from "../middleware/auth";
import { comparePassword, hashPassword } from "../services/auth.service";

const router = Router();
router.use(authenticate);

// ── GET /api/users/me ─────────────────────────────────────────────────────────
router.get("/me", async (req: Request, res: Response): Promise<void> => {
  try {
    const [user] = await db
      .select({
        id:                 users.id,
        email:              users.email,
        role:               users.role,
        tenantId:           users.tenantId,
        firstName:          users.firstName,
        lastName:           users.lastName,
        phoneWhatsapp:      users.phoneWhatsapp,
        telegramId:         users.telegramId,
        languagePref:       users.languagePref,
        timezone:           users.timezone,
        notifyWhatsapp:     users.notifyWhatsapp,
        notifyTelegram:     users.notifyTelegram,
        notifyEscalations:  users.notifyEscalations,
        notifyNewEmployees: users.notifyNewEmployees,
        createdAt:          users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.user!.sub))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/me ─────────────────────────────────────────────────────────
router.put("/me", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      firstName, lastName, phoneWhatsapp, telegramId,
      languagePref, timezone,
      notifyWhatsapp, notifyTelegram, notifyEscalations, notifyNewEmployees,
    } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (firstName          !== undefined) updates.firstName          = String(firstName ?? "").trim();
    if (lastName           !== undefined) updates.lastName           = String(lastName  ?? "").trim();
    if (phoneWhatsapp      !== undefined) updates.phoneWhatsapp      = phoneWhatsapp ? String(phoneWhatsapp).replace(/\s/g, "") : null;
    if (telegramId         !== undefined) updates.telegramId         = telegramId  ? String(telegramId).trim()  : null;
    if (languagePref       !== undefined) updates.languagePref       = languagePref;
    if (timezone           !== undefined) updates.timezone           = timezone;
    if (notifyWhatsapp     !== undefined) updates.notifyWhatsapp     = Boolean(notifyWhatsapp);
    if (notifyTelegram     !== undefined) updates.notifyTelegram     = Boolean(notifyTelegram);
    if (notifyEscalations  !== undefined) updates.notifyEscalations  = Boolean(notifyEscalations);
    if (notifyNewEmployees !== undefined) updates.notifyNewEmployees = Boolean(notifyNewEmployees);

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, req.user!.sub))
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/me/password ────────────────────────────────────────────────
router.put("/me/password", async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "currentPassword and newPassword are required" });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters" });
      return;
    }

    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, req.user!.sub))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const hash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash: hash, updatedAt: new Date() })
      .where(eq(users.id, req.user!.sub));

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/users/audit-logs ─────────────────────────────────────────────────
router.get("/audit-logs", async (req: Request, res: Response): Promise<void> => {
  try {
    const u = req.user!;
    const tenantId = u.role === "super_admin"
      ? (req.query.tenantId as string) || null
      : u.tenantId ?? null;

    const page   = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10));
    const limit  = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 100);
    const offset = (page - 1) * limit;

    const condition = tenantId
      ? eq(auditLogs.tenantId, tenantId)
      : isNotNull(auditLogs.tenantId);

    const logs = await db
      .select({
        id:         auditLogs.id,
        action:     auditLogs.action,
        entityType: auditLogs.entityType,
        entityId:   auditLogs.entityId,
        oldValue:   auditLogs.oldValue,
        newValue:   auditLogs.newValue,
        ipAddress:  auditLogs.ipAddress,
        createdAt:  auditLogs.createdAt,
        userEmail:  users.email,
        userFirst:  users.firstName,
        userLast:   users.lastName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(condition)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ data: logs, meta: { page, limit } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
