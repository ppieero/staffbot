import { Router, Request, Response } from "express";
import { and, desc, eq, gte, isNotNull, lte, sql, sum } from "drizzle-orm";
import { db } from "../db";
import { conversations, employees, messages, pricingConfig, tenants } from "../db/schema";
import { authenticate } from "../middleware/auth";
import { requireSuperAdmin } from "../middleware/requireRole";

const router = Router();
router.use(authenticate);

function resolveTenantId(req: Request): string | null {
  const user = req.user!;
  if (user.role === "super_admin") return (req.query.tenantId as string) || null;
  return user.tenantId ?? null;
}

// ── GET /api/tokens/pricing — super_admin only ────────────────────────────────
router.get("/pricing", requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const [cfg] = await db.select().from(pricingConfig).limit(1);
    res.json(cfg ?? { model: "claude-sonnet-4-6", inputPricePer1m: 3.0, outputPricePer1m: 15.0, marginPct: 30.0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/tokens/pricing — super_admin only ────────────────────────────────
router.put("/pricing", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { inputPricePer1m, outputPricePer1m, marginPct } = req.body as {
      inputPricePer1m?: number;
      outputPricePer1m?: number;
      marginPct?: number;
    };

    const [existing] = await db.select({ id: pricingConfig.id }).from(pricingConfig).limit(1);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (inputPricePer1m  !== undefined) updates.inputPricePer1m  = inputPricePer1m;
    if (outputPricePer1m !== undefined) updates.outputPricePer1m = outputPricePer1m;
    if (marginPct        !== undefined) updates.marginPct        = marginPct;

    let cfg;
    if (existing) {
      [cfg] = await db.update(pricingConfig).set(updates).where(eq(pricingConfig.id, existing.id)).returning();
    } else {
      [cfg] = await db.insert(pricingConfig).values({
        inputPricePer1m:  inputPricePer1m  ?? 3.0,
        outputPricePer1m: outputPricePer1m ?? 15.0,
        marginPct:        marginPct        ?? 30.0,
      }).returning();
    }
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tokens/summary ───────────────────────────────────────────────────
router.get("/summary", async (req: Request, res: Response): Promise<void> => {
  try {
    const user     = req.user!;
    const tenantId = resolveTenantId(req);
    const isSA     = user.role === "super_admin";

    // Date range — default current month
    const now           = new Date();
    const defaultStart  = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd    = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const from = req.query.from ? new Date(req.query.from as string) : defaultStart;
    const to   = req.query.to   ? new Date(req.query.to   as string) : defaultEnd;

    // Pricing config
    const [pricing] = await db.select().from(pricingConfig).limit(1);
    const inputPrice  = pricing?.inputPricePer1m  ?? 3.0;
    const outputPrice = pricing?.outputPricePer1m ?? 15.0;
    const marginPct   = pricing?.marginPct        ?? 30.0;

    // Build filters
    const dateFilter = and(gte(messages.sentAt, from), lte(messages.sentAt, to));
    const tenantFilter = tenantId
      ? eq(conversations.tenantId, tenantId)
      : isNotNull(conversations.tenantId);

    // Aggregate: per-tenant or single tenant
    let rows: Array<{
      tenantId: string;
      tenantName: string;
      totalInput:  number;
      totalOutput: number;
      totalTokens: number;
      messageCount: number;
    }>;

    if (isSA && !tenantId) {
      // Super admin — breakdown by tenant
      const raw = await db
        .select({
          tenantId:    conversations.tenantId,
          tenantName:  tenants.name,
          totalInput:  sql<number>`coalesce(sum(${messages.tokensInput}), 0)`,
          totalOutput: sql<number>`coalesce(sum(${messages.tokensOutput}), 0)`,
          totalTokens: sql<number>`coalesce(sum(${messages.tokensUsed}), 0)`,
          messageCount: sql<number>`count(${messages.id})`,
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .innerJoin(tenants, eq(conversations.tenantId, tenants.id))
        .where(and(dateFilter, isNotNull(conversations.tenantId)))
        .groupBy(conversations.tenantId, tenants.name)
        .orderBy(desc(sql`coalesce(sum(${messages.tokensUsed}), 0)`));

      rows = raw.map((r) => ({
        tenantId:     r.tenantId!,
        tenantName:   r.tenantName,
        totalInput:   Number(r.totalInput),
        totalOutput:  Number(r.totalOutput),
        totalTokens:  Number(r.totalTokens),
        messageCount: Number(r.messageCount),
      }));
    } else {
      // Single tenant
      const [r] = await db
        .select({
          totalInput:  sql<number>`coalesce(sum(${messages.tokensInput}), 0)`,
          totalOutput: sql<number>`coalesce(sum(${messages.tokensOutput}), 0)`,
          totalTokens: sql<number>`coalesce(sum(${messages.tokensUsed}), 0)`,
          messageCount: sql<number>`count(${messages.id})`,
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(dateFilter, tenantFilter));

      let tenantName = "My Company";
      if (tenantId) {
        const [t] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        tenantName = t?.name ?? tenantName;
      }

      rows = [{
        tenantId:     tenantId ?? "all",
        tenantName,
        totalInput:   Number(r?.totalInput  ?? 0),
        totalOutput:  Number(r?.totalOutput ?? 0),
        totalTokens:  Number(r?.totalTokens ?? 0),
        messageCount: Number(r?.messageCount ?? 0),
      }];
    }

    // Compute costs
    const result = rows.map((r) => {
      // Use input/output breakdown when available, fall back to tokensUsed
      const inp = r.totalInput || 0;
      const out = r.totalOutput || 0;
      // If no input/output breakdown, assume 70/30 split from tokensUsed
      const effectiveIn  = inp > 0 ? inp  : Math.round(r.totalTokens * 0.7);
      const effectiveOut = out > 0 ? out  : Math.round(r.totalTokens * 0.3);

      const baseCost   = (effectiveIn / 1_000_000) * inputPrice + (effectiveOut / 1_000_000) * outputPrice;
      const billedCost = baseCost * (1 + marginPct / 100);

      return {
        tenantId:     r.tenantId,
        tenantName:   r.tenantName,
        totalTokens:  r.totalTokens,
        tokensInput:  inp,
        tokensOutput: out,
        messageCount: r.messageCount,
        baseCost:     isSA ? Math.round(baseCost   * 10000) / 10000 : undefined,
        billedCost:   Math.round(billedCost * 10000) / 10000,
      };
    });

    // Totals
    const grandTotalTokens  = result.reduce((s, r) => s + r.totalTokens,  0);
    const grandBilledCost   = result.reduce((s, r) => s + r.billedCost,   0);
    const grandBaseCost     = isSA ? result.reduce((s, r) => s + (r.baseCost ?? 0), 0) : undefined;
    const grandMessages     = result.reduce((s, r) => s + r.messageCount, 0);

    res.json({
      from:  from.toISOString(),
      to:    to.toISOString(),
      totals: {
        tokens:      grandTotalTokens,
        messages:    grandMessages,
        baseCost:    isSA ? Math.round((grandBaseCost ?? 0) * 10000) / 10000 : undefined,
        billedCost:  Math.round(grandBilledCost * 10000) / 10000,
      },
      pricing: isSA ? { inputPricePer1m: inputPrice, outputPricePer1m: outputPrice, marginPct } : undefined,
      tenants: result,
    });
  } catch (err: any) {
    console.error("[tokens] summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tokens/daily — sparkline data ────────────────────────────────────
router.get("/daily", async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    const isSA     = req.user!.role === "super_admin";

    const now          = new Date();
    const from         = new Date(now.getFullYear(), now.getMonth(), 1);
    const tenantFilter = tenantId
      ? eq(conversations.tenantId, tenantId)
      : isNotNull(conversations.tenantId);

    const rows = await db
      .select({
        day:         sql<string>`date_trunc('day', ${messages.sentAt})::date`,
        totalTokens: sql<number>`coalesce(sum(${messages.tokensUsed}), 0)`,
        messages:    sql<number>`count(${messages.id})`,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(gte(messages.sentAt, from), tenantFilter))
      .groupBy(sql`date_trunc('day', ${messages.sentAt})::date`)
      .orderBy(sql`date_trunc('day', ${messages.sentAt})::date`);

    res.json(rows.map((r) => ({
      day:         r.day,
      tokens:      Number(r.totalTokens),
      messages:    Number(r.messages),
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
