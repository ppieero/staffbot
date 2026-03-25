"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import api from "@/lib/api";

const PLANS = ["starter", "pro", "enterprise"];
const STATUSES = ["active", "trial", "suspended"];

type TenantForm = {
  plan: string;
  status: string;
  maxEmployees: number;
  maxDocuments: number;
  maxMessagesPerMonth: number;
};

type Tenant = TenantForm & {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  stats: {
    employeeCount: number;
    documentCount: number;
    messagesThisMonth: number;
    conversationCount: number;
  };
};

export default function EditTenantPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState<TenantForm>({
    plan: "starter",
    status: "trial",
    maxEmployees: 100,
    maxDocuments: 500,
    maxMessagesPerMonth: 10000,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.get(`/tenants/${id}`)
      .then((r) => {
        const t: Tenant = r.data.data;
        setTenant(t);
        setForm({
          plan: t.plan,
          status: t.status,
          maxEmployees: t.maxEmployees,
          maxDocuments: t.maxDocuments,
          maxMessagesPerMonth: t.maxMessagesPerMonth,
        });
      })
      .catch(() => setError("Failed to load tenant."))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      await api.put(`/tenants/${id}`, form);
      setSuccess(true);
      setTimeout(() => router.push("/dashboard/tenants"), 800);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; error?: string; errors?: { msg: string }[] } } })?.response?.data;
      setError(
        data?.message ??
        data?.error ??
        (data?.errors?.length ? data.errors.map((e) => e.msg).join(", ") : null) ??
        "Failed to save changes."
      );
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "0.625rem 0.875rem",
    background: "#1a1f2e",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: "0.875rem",
    outline: "none",
  };

  const labelStyle = {
    display: "block" as const,
    marginBottom: "0.375rem",
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "var(--text-secondary)",
  };

  if (loading) {
    return <div style={{ color: "var(--text-secondary)", padding: "2rem", fontSize: "0.875rem" }}>Loading…</div>;
  }

  if (!tenant && !loading) {
    return <div style={{ color: "#f87171", padding: "2rem", fontSize: "0.875rem" }}>Tenant not found.</div>;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <button
          onClick={() => router.back()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            fontSize: "0.875rem",
            cursor: "pointer",
            marginBottom: "0.75rem",
            padding: 0,
          }}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
          {tenant?.name}
        </h1>
        <p style={{ marginTop: "0.25rem", color: "var(--text-muted)", fontSize: "0.875rem", fontFamily: "var(--font-dm-mono)" }}>
          {tenant?.slug}
        </p>
      </div>

      {/* Stats */}
      {tenant?.stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.75rem" }}>
          {[
            { label: "Employees", value: tenant.stats.employeeCount },
            { label: "Documents", value: tenant.stats.documentCount },
            { label: "Conversations", value: tenant.stats.conversationCount },
            { label: "Messages / mo", value: tenant.stats.messagesThisMonth },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "0.875rem 1rem",
              }}
            >
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-dm-mono)" }}>
                {value.toLocaleString()}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Edit form */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "1.75rem",
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>Plan</label>
              <select
                style={{ ...inputStyle, cursor: "pointer" }}
                value={form.plan}
                onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
              >
                {PLANS.map((p) => (
                  <option key={p} value={p} style={{ background: "#1a1f2e" }}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select
                style={{ ...inputStyle, cursor: "pointer" }}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s} style={{ background: "#1a1f2e" }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "1.25rem",
            }}
          >
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Limits
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={labelStyle}>Max employees</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.maxEmployees}
                  onChange={(e) => setForm((f) => ({ ...f, maxEmployees: parseInt(e.target.value) }))}
                  min={1}
                />
              </div>
              <div>
                <label style={labelStyle}>Max documents</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.maxDocuments}
                  onChange={(e) => setForm((f) => ({ ...f, maxDocuments: parseInt(e.target.value) }))}
                  min={1}
                />
              </div>
              <div>
                <label style={labelStyle}>Max messages / mo</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.maxMessagesPerMonth}
                  onChange={(e) => setForm((f) => ({ ...f, maxMessagesPerMonth: parseInt(e.target.value) }))}
                  min={1}
                />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ padding: "0.625rem 0.875rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: "0.8125rem" }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ padding: "0.625rem 0.875rem", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 8, color: "#4ade80", fontSize: "0.8125rem" }}>
              Saved — redirecting…
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => router.back()}
              style={{
                padding: "0.625rem 1.25rem",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "0.625rem 1.25rem",
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
