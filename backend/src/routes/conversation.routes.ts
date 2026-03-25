import { Router, Request, Response } from "express";
import { SQL, and, asc, count, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { db } from "../db";
import {
  conversations,
  employees,
  messages,
  positionProfiles,
} from "../db/schema";

const router = Router();

// All routes require JWT auth
router.use(authenticate);

/**
 * Resolves the effective tenantId for scoping queries.
 * - company_admin / company_viewer: always their own tenant (from JWT)
 * - super_admin: reads ?tenantId= from query (or body); null = all tenants
 */
function resolveTenantId(req: Request, fromBody = false): string | null {
  const user = req.user!;
  if (user.role !== "super_admin") return user.tenantId ?? null;
  const override = fromBody
    ? (req.body.tenantId as string | undefined)
    : (req.query.tenantId as string | undefined);
  return override ?? null;
}

/** Build a WHERE condition for tenantId: null means "all tenants" (super_admin). */
function tenantCondition(tenantId: string | null) {
  return tenantId
    ? eq(conversations.tenantId, tenantId)
    : isNotNull(conversations.tenantId);
}

// ── GET /api/conversations ────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const tenantId = resolveTenantId(req);
  const page   = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10));
  const limit  = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 100);
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  // Build base where conditions
  const conditions: SQL[] = [tenantCondition(tenantId)];
  if (status && ["open", "closed", "escalated"].includes(status)) {
    conditions.push(eq(conversations.status, status as "open" | "closed" | "escalated"));
  }

  // Subquery: message count per conversation
  const msgCountSq = db
    .select({
      conversationId: messages.conversationId,
      msgCount: count(messages.id).as("msg_count"),
    })
    .from(messages)
    .groupBy(messages.conversationId)
    .as("msg_counts");

  // Subquery: last message per conversation
  const lastMsgSq = db
    .selectDistinctOn([messages.conversationId], {
      conversationId: messages.conversationId,
      lastContent:    messages.content,
      lastRole:       messages.role,
      lastSentAt:     messages.sentAt,
    })
    .from(messages)
    .orderBy(messages.conversationId, desc(messages.sentAt))
    .as("last_msgs");

  // Build query with optional search
  const searchConditions: SQL[] = search?.trim()
    ? [
        ...conditions,
        or(
          ilike(employees.firstName,    `%${search.trim()}%`),
          ilike(employees.lastName,     `%${search.trim()}%`),
          ilike(employees.phoneWhatsapp, `%${search.trim()}%`)
        ) as SQL,
      ]
    : conditions;

  const rows = await db
    .select({
      id:              conversations.id,
      status:          conversations.status,
      channel:         conversations.channel,
      startedAt:       conversations.startedAt,
      lastMessageAt:   conversations.lastMessageAt,
      employeeId:      employees.id,
      employeeFirstName: employees.firstName,
      employeeLastName:  employees.lastName,
      employeePhone:   employees.phoneWhatsapp,
      employeeLang:    employees.languagePref,
      profileId:       positionProfiles.id,
      profileName:     positionProfiles.name,
      messageCount:    msgCountSq.msgCount,
      lastContent:     lastMsgSq.lastContent,
      lastRole:        lastMsgSq.lastRole,
    })
    .from(conversations)
    .innerJoin(employees,         eq(conversations.employeeId, employees.id))
    .innerJoin(positionProfiles,  eq(employees.profileId, positionProfiles.id))
    .leftJoin(msgCountSq,         eq(conversations.id, msgCountSq.conversationId))
    .leftJoin(lastMsgSq,          eq(conversations.id, lastMsgSq.conversationId))
    .where(and(...searchConditions))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit)
    .offset(offset);

  // Total count (without search, for pagination)
  const [{ total }] = await db
    .select({ total: count(conversations.id) })
    .from(conversations)
    .innerJoin(employees, eq(conversations.employeeId, employees.id))
    .where(and(...conditions));

  res.json({
    data: rows.map((r) => ({
      id:            r.id,
      status:        r.status,
      channel:       r.channel,
      startedAt:     r.startedAt,
      lastMessageAt: r.lastMessageAt,
      messageCount:  Number(r.messageCount ?? 0),
      lastContent:   r.lastContent ?? null,
      lastRole:      r.lastRole ?? null,
      employee: {
        id:        r.employeeId,
        firstName: r.employeeFirstName,
        lastName:  r.employeeLastName,
        phone:     r.employeePhone,
        lang:      r.employeeLang,
      },
      profile: {
        id:   r.profileId,
        name: r.profileName,
      },
    })),
    meta: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
    },
  });
});

// ── GET /api/conversations/:id/messages ──────────────────────────────────────
router.get("/:id/messages", async (req: Request, res: Response): Promise<void> => {
  const tenantId = resolveTenantId(req);
  const convId   = req.params.id;

  // Verify the conversation belongs to this tenant (or exists, for super_admin)
  const [conv] = await db
    .select({ id: conversations.id, status: conversations.status })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, convId),
        tenantCondition(tenantId)
      )
    )
    .limit(1);

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const msgs = await db
    .select({
      id:         messages.id,
      role:       messages.role,
      content:    messages.content,
      sources:    messages.sources,
      tokensUsed: messages.tokensUsed,
      latencyMs:  messages.latencyMs,
      sentAt:     messages.sentAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, convId))
    .orderBy(asc(messages.sentAt));

  res.json({ data: msgs });
});

// ── PATCH /api/conversations/:id/status ──────────────────────────────────────
router.patch("/:id/status", async (req: Request, res: Response): Promise<void> => {
  const tenantId = resolveTenantId(req, true);
  const { status } = req.body as { status?: string };

  if (!status || !["open", "closed", "escalated"].includes(status)) {
    res.status(422).json({ error: "status must be open, closed, or escalated" });
    return;
  }

  const [updated] = await db
    .update(conversations)
    .set({ status: status as "open" | "closed" | "escalated", updatedAt: new Date() })
    .where(
      and(
        eq(conversations.id, req.params.id),
        tenantCondition(tenantId)
      )
    )
    .returning({ id: conversations.id, status: conversations.status });

  if (!updated) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json({ data: updated });
});

export default router;
