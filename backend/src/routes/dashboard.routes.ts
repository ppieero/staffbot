import { Router, Request, Response } from "express";
import { and, count, desc, eq, gte, isNotNull, lte, SQL } from "drizzle-orm";
import { db } from "../db";
import {
  conversations,
  documents,
  employees,
  messages,
  positionProfiles,
} from "../db/schema";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

function resolveTenantId(req: Request): string | null {
  const user = req.user!;
  if (user.role === "super_admin") return (req.query.tenantId as string) || null;
  return user.tenantId ?? null;
}

router.get("/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);

    const empFilter  = tenantId ? eq(employees.tenantId, tenantId)         : isNotNull(employees.tenantId);
    const profFilter = tenantId ? eq(positionProfiles.tenantId, tenantId)   : isNotNull(positionProfiles.tenantId);
    const docFilter  = tenantId ? eq(documents.tenantId, tenantId)          : isNotNull(documents.tenantId);
    const convFilter = tenantId ? eq(conversations.tenantId, tenantId)      : isNotNull(conversations.tenantId);

    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLast  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLast    = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const msgThisFilter: SQL[] = tenantId
      ? [eq(conversations.tenantId, tenantId), gte(messages.sentAt, startOfMonth)]
      : [isNotNull(conversations.tenantId),    gte(messages.sentAt, startOfMonth)];

    const msgLastFilter: SQL[] = tenantId
      ? [eq(conversations.tenantId, tenantId), gte(messages.sentAt, startOfLast), lte(messages.sentAt, endOfLast)]
      : [isNotNull(conversations.tenantId),    gte(messages.sentAt, startOfLast), lte(messages.sentAt, endOfLast)];

    const [
      [{ employees: totalEmployees }],
      [{ profiles: activeProfiles }],
      [{ docs: docsIndexed }],
      [{ msgs: msgsThisMonth }],
      [{ msgs: msgsLastMonth }],
      recentConvs,
    ] = await Promise.all([
      db.select({ employees: count() }).from(employees).where(empFilter),

      db.select({ profiles: count() }).from(positionProfiles).where(
        tenantId
          ? and(eq(positionProfiles.tenantId, tenantId), eq(positionProfiles.status, "active"))
          : and(isNotNull(positionProfiles.tenantId),    eq(positionProfiles.status, "active"))
      ),

      db.select({ docs: count() }).from(documents).where(
        tenantId
          ? and(eq(documents.tenantId, tenantId), eq(documents.indexingStatus, "indexed"))
          : and(isNotNull(documents.tenantId),    eq(documents.indexingStatus, "indexed"))
      ),

      db.select({ msgs: count() })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(...msgThisFilter)),

      db.select({ msgs: count() })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(...msgLastFilter)),

      db.select({
        id:            conversations.id,
        status:        conversations.status,
        lastMessageAt: conversations.lastMessageAt,
        startedAt:     conversations.startedAt,
        employeeFirst: employees.firstName,
        employeeLast:  employees.lastName,
        profileName:   positionProfiles.name,
      })
        .from(conversations)
        .innerJoin(employees,        eq(conversations.employeeId, employees.id))
        .innerJoin(positionProfiles, eq(employees.profileId, positionProfiles.id))
        .where(convFilter)
        .orderBy(desc(conversations.lastMessageAt))
        .limit(10),
    ]);

    const msgsThis = Number(msgsThisMonth);
    const msgsLast = Number(msgsLastMonth);
    const msgTrend = msgsLast > 0
      ? Math.round(((msgsThis - msgsLast) / msgsLast) * 100)
      : 0;

    res.json({
      // Keys match the existing frontend STAT_CARDS mapping
      employees: Number(totalEmployees),
      profiles:  Number(activeProfiles),
      documents: Number(docsIndexed),
      messages:  msgsThis,
      msgTrend,
      recentConversations: recentConvs,
    });
  } catch (err: any) {
    console.error("[dashboard] stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
