"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

interface PricingConfig {
  id: string;
  model: string;
  inputPricePer1m: number;
  outputPricePer1m: number;
  marginPct: number;
  updatedAt: string;
}

interface TenantSummary {
  tenantId: string;
  tenantName: string;
  totalTokens: number;
  tokensInput: number;
  tokensOutput: number;
  messageCount: number;
  baseCost?: number;
  billedCost: number;
}

interface Summary {
  from: string;
  to: string;
  totals: {
    tokens: number;
    messages: number;
    baseCost?: number;
    billedCost: number;
  };
  pricing?: {
    inputPricePer1m: number;
    outputPricePer1m: number;
    marginPct: number;
  };
  tenants: TenantSummary[];
}

function fmtCost(n: number) {
  return "$" + n.toFixed(4);
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

export default function TokensPage() {
  const qc = useQueryClient();
  const user = typeof window !== "undefined" ? getCurrentUser() : null;
  const isSA = user?.role === "super_admin";

  // Month selector
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based

  const from = new Date(year, month, 1).toISOString();
  const to   = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();

  const summaryQ = useQuery<Summary>({
    queryKey: ["tokens-summary", year, month],
    queryFn: () => api.get(`/tokens/summary?from=${from}&to=${to}`).then((r) => r.data),
  });

  const pricingQ = useQuery<PricingConfig>({
    queryKey: ["tokens-pricing"],
    queryFn: () => api.get("/tokens/pricing").then((r) => r.data),
    enabled: isSA,
  });

  // Pricing edit state
  const [editMargin, setEditMargin] = useState<string>("");
  const [editInput,  setEditInput]  = useState<string>("");
  const [editOutput, setEditOutput] = useState<string>("");
  const [showEdit,   setShowEdit]   = useState(false);

  const pricingMut = useMutation({
    mutationFn: (body: Partial<PricingConfig>) => api.put("/tokens/pricing", body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tokens-pricing"] });
      qc.invalidateQueries({ queryKey: ["tokens-summary"] });
      setShowEdit(false);
    },
  });

  function openEdit() {
    if (!pricingQ.data) return;
    setEditInput(String(pricingQ.data.inputPricePer1m));
    setEditOutput(String(pricingQ.data.outputPricePer1m));
    setEditMargin(String(pricingQ.data.marginPct));
    setShowEdit(true);
  }

  function savePricing() {
    pricingMut.mutate({
      inputPricePer1m:  parseFloat(editInput),
      outputPricePer1m: parseFloat(editOutput),
      marginPct:        parseFloat(editMargin),
    });
  }

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    const n = new Date();
    if (year > n.getFullYear() || (year === n.getFullYear() && month >= n.getMonth())) return;
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const s = summaryQ.data;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            Token Usage &amp; Billing
          </h1>
          <p style={{ margin: "0.25rem 0 0", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            {isSA ? "Real costs, per-tenant breakdown, and margin configuration." : "Your monthly token consumption and billed cost."}
          </p>
        </div>

        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button onClick={prevMonth} style={navBtnStyle}>&#8592;</button>
          <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", minWidth: 100, textAlign: "center" }}>
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} style={navBtnStyle}>&#8594;</button>
        </div>
      </div>

      {summaryQ.isLoading && (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      )}

      {s && (
        <>
          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            <KpiCard label="Total Tokens" value={fmtNum(s.totals.tokens)} sub={`${fmtNum(s.totals.messages)} messages`} />
            <KpiCard label="Billed Cost" value={fmtCost(s.totals.billedCost)} accent />
            {isSA && s.totals.baseCost !== undefined && (
              <KpiCard label="Base Cost (AI)" value={fmtCost(s.totals.baseCost)} sub={`margin: ${s.pricing?.marginPct ?? 0}%`} />
            )}
            {isSA && s.totals.baseCost !== undefined && (
              <KpiCard label="Gross Margin" value={fmtCost(s.totals.billedCost - s.totals.baseCost)} sub="billed − base" />
            )}
          </div>

          {/* Super admin: pricing config */}
          {isSA && pricingQ.data && !showEdit && (
            <div style={{ ...cardStyle, marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginRight: "1rem" }}>
                  Model: <strong style={{ color: "var(--text-primary)" }}>{pricingQ.data.model}</strong>
                </span>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginRight: "1rem" }}>
                  Input: <strong style={{ color: "var(--text-primary)" }}>${pricingQ.data.inputPricePer1m}/1M</strong>
                </span>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginRight: "1rem" }}>
                  Output: <strong style={{ color: "var(--text-primary)" }}>${pricingQ.data.outputPricePer1m}/1M</strong>
                </span>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  Margin: <strong style={{ color: "var(--text-primary)" }}>{pricingQ.data.marginPct}%</strong>
                </span>
              </div>
              <button onClick={openEdit} style={btnOutlineStyle}>Edit Pricing</button>
            </div>
          )}

          {/* Pricing edit form */}
          {isSA && showEdit && (
            <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Edit Pricing Config
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <label style={labelStyle}>
                  Input price ($/1M tokens)
                  <input value={editInput} onChange={(e) => setEditInput(e.target.value)} style={inputStyle} type="number" step="0.01" />
                </label>
                <label style={labelStyle}>
                  Output price ($/1M tokens)
                  <input value={editOutput} onChange={(e) => setEditOutput(e.target.value)} style={inputStyle} type="number" step="0.01" />
                </label>
                <label style={labelStyle}>
                  Margin %
                  <input value={editMargin} onChange={(e) => setEditMargin(e.target.value)} style={inputStyle} type="number" step="1" />
                </label>
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button onClick={savePricing} disabled={pricingMut.isPending} style={btnPrimaryStyle}>
                  {pricingMut.isPending ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setShowEdit(false)} style={btnOutlineStyle}>Cancel</button>
              </div>
              {pricingMut.isError && (
                <p style={{ color: "#f87171", fontSize: "0.8125rem", marginTop: "0.5rem" }}>
                  {(pricingMut.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Save failed"}
                </p>
              )}
            </div>
          )}

          {/* Per-tenant table (super_admin) or single-tenant stats */}
          {isSA && s.tenants.length > 1 ? (
            <div style={cardStyle}>
              <h2 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Per-Company Breakdown
              </h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr>
                    {["Company","Messages","Tokens","Base Cost","Billed Cost","Tokens In","Tokens Out"].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.tenants.map((t) => (
                    <tr key={t.tenantId} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={tdStyle}><strong>{t.tenantName}</strong></td>
                      <td style={tdStyle}>{fmtNum(t.messageCount)}</td>
                      <td style={tdStyle}>{fmtNum(t.totalTokens)}</td>
                      <td style={tdStyle}>{t.baseCost !== undefined ? fmtCost(t.baseCost) : "—"}</td>
                      <td style={{ ...tdStyle, color: "var(--accent)", fontWeight: 600 }}>{fmtCost(t.billedCost)}</td>
                      <td style={tdStyle}>{t.tokensInput ? fmtNum(t.tokensInput) : "—"}</td>
                      <td style={tdStyle}>{t.tokensOutput ? fmtNum(t.tokensOutput) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={cardStyle}>
              <h2 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                {s.tenants[0]?.tenantName ?? "Usage Details"}
              </h2>
              {s.tenants[0] ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
                  <StatRow label="Messages"     value={fmtNum(s.tenants[0].messageCount)} />
                  <StatRow label="Total Tokens" value={fmtNum(s.tenants[0].totalTokens)} />
                  <StatRow label="Input Tokens"  value={s.tenants[0].tokensInput  ? fmtNum(s.tenants[0].tokensInput)  : "—"} />
                  <StatRow label="Output Tokens" value={s.tenants[0].tokensOutput ? fmtNum(s.tenants[0].tokensOutput) : "—"} />
                  {isSA && s.tenants[0].baseCost !== undefined && (
                    <StatRow label="Base Cost"  value={fmtCost(s.tenants[0].baseCost)} />
                  )}
                  <StatRow label="Billed Cost"  value={fmtCost(s.tenants[0].billedCost)} accent />
                </div>
              ) : (
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No usage this month.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.375rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: accent ? "var(--accent)" : "var(--text-primary)", lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{sub}</div>}
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: "1.125rem", fontWeight: 700, color: accent ? "var(--accent)" : "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "1.25rem",
};

const navBtnStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-secondary)",
  cursor: "pointer",
  padding: "0.25rem 0.625rem",
  fontSize: "1rem",
};

const btnOutlineStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 7,
  color: "var(--text-secondary)",
  cursor: "pointer",
  padding: "0.4375rem 1rem",
  fontSize: "0.8125rem",
  fontWeight: 500,
};

const btnPrimaryStyle: React.CSSProperties = {
  background: "var(--accent)",
  border: "none",
  borderRadius: 7,
  color: "#fff",
  cursor: "pointer",
  padding: "0.4375rem 1.25rem",
  fontSize: "0.8125rem",
  fontWeight: 600,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
  fontSize: "0.8125rem",
  color: "var(--text-secondary)",
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  border: "1px solid var(--border)",
  borderRadius: 7,
  color: "var(--text-primary)",
  fontSize: "0.9375rem",
  padding: "0.5rem 0.75rem",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.75rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid var(--border)",
};

const tdStyle: React.CSSProperties = {
  padding: "0.625rem 0.75rem",
  color: "var(--text-primary)",
};
