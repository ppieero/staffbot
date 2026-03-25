"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import api from "@/lib/api";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  maxEmployees: number;
  maxDocuments: number;
  status: "active" | "trial" | "suspended";
  createdAt: string;
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active: { bg: "rgba(74,222,128,0.1)", color: "#4ade80" },
  trial: { bg: "rgba(251,191,36,0.1)", color: "#fbbf24" },
  suspended: { bg: "rgba(248,113,113,0.1)", color: "#f87171" },
};


type ImpersonationInfo = { tenantName: string; adminEmail: string };

export default function TenantsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<ImpersonationInfo | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("staffbot_impersonating");
    if (stored) setImpersonating(JSON.parse(stored));
  }, []);

  async function handleImpersonate(tenant: Tenant) {
    setLoadingId(tenant.id);
    try {
      const res = await api.post(`/auth/impersonate/${tenant.id}`);
      // Save original token before replacing it
      const original = Cookies.get("staffbot_token");
      if (original) localStorage.setItem("staffbot_original_token", original);
      // Swap to impersonation token
      Cookies.set("staffbot_token", res.data.accessToken, { expires: 1/24, sameSite: "lax" });
      const info: ImpersonationInfo = {
        tenantName: res.data.impersonating.tenantName,
        adminEmail: res.data.impersonating.adminEmail,
      };
      localStorage.setItem("staffbot_impersonating", JSON.stringify(info));
      setImpersonating(info);
      qc.clear();
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to impersonate";
      alert(msg);
    } finally {
      setLoadingId(null);
    }
  }

  function handleUnimpersonate() {
    const original = localStorage.getItem("staffbot_original_token");
    if (original) Cookies.set("staffbot_token", original, { expires: 7, sameSite: "lax" });
    localStorage.removeItem("staffbot_original_token");
    localStorage.removeItem("staffbot_impersonating");
    setImpersonating(null);
    qc.clear();
    router.refresh();
  }

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ["tenants"],
    queryFn: () => api.get("/tenants").then((r) => r.data.data),
  });

  if (isLoading) {
    return <div style={{ color: "var(--text-secondary)", padding: "2rem", fontSize: "0.875rem" }}>Loading companies…</div>;
  }

  return (
    <div>
      {/* Impersonation banner */}
      {impersonating && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.75rem 1.25rem", marginBottom: "1.25rem",
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <span style={{ fontSize: "0.875rem", color: "#fbbf24", fontWeight: 600 }}>
              Viewing as: {impersonating.tenantName}
            </span>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>({impersonating.adminEmail})</span>
          </div>
          <button
            onClick={handleUnimpersonate}
            style={{ padding: "0.375rem 0.875rem", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 7, color: "#fbbf24", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}
          >
            ← Return to Super Admin
          </button>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.75rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            Companies
          </h1>
          <p style={{ marginTop: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            {tenants.length} tenant{tenants.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard/tenants/new")}
          style={{
            padding: "0.5rem 1rem",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Company
        </button>
      </div>

      {/* Table */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {tenants.length === 0 ? (
          <div style={{ padding: "4rem", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🏢</div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              No companies yet. Add your first tenant to get started.
            </p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Company", "Plan", "Max Employees", "Max Documents", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "0.875rem 1.25rem",
                      textAlign: "left",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant, i) => {
                const sc = STATUS_COLORS[tenant.status] ?? STATUS_COLORS.active;
                return (
                  <tr
                    key={tenant.id}
                    style={{
                      borderBottom: i < tenants.length - 1 ? "1px solid var(--border)" : "none",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "1rem 1.25rem" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)" }}>
                        {tenant.name}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          fontFamily: "var(--font-dm-mono)",
                          marginTop: 2,
                        }}
                      >
                        {tenant.slug}
                      </div>
                    </td>
                    <td style={{ padding: "1rem 1.25rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          background: "rgba(99,102,241,0.1)",
                          color: "#a5b4fc",
                          borderRadius: 4,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          textTransform: "capitalize",
                        }}
                      >
                        {tenant.plan}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 1.25rem", fontSize: "0.875rem", color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}>
                      {tenant.maxEmployees.toLocaleString()}
                    </td>
                    <td style={{ padding: "1rem 1.25rem", fontSize: "0.875rem", color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}>
                      {tenant.maxDocuments.toLocaleString()}
                    </td>
                    <td style={{ padding: "1rem 1.25rem" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "3px 10px",
                          background: sc.bg,
                          color: sc.color,
                          borderRadius: 20,
                          fontSize: "0.75rem",
                          fontWeight: 600,
                        }}
                      >
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            background: sc.color,
                          }}
                        />
                        {tenant.status}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 1.25rem" }}>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          onClick={() => handleImpersonate(tenant)}
                          disabled={loadingId === tenant.id}
                          style={{
                            padding: "0.375rem 0.75rem",
                            background: "rgba(99,102,241,0.1)",
                            border: "1px solid rgba(99,102,241,0.3)",
                            borderRadius: 6,
                            color: "var(--accent)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            cursor: loadingId === tenant.id ? "not-allowed" : "pointer",
                            opacity: loadingId === tenant.id ? 0.6 : 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {loadingId === tenant.id ? "…" : "Login as"}
                        </button>
                        <button
                          onClick={() => router.push(`/dashboard/tenants/${tenant.id}`)}
                          style={{
                            padding: "0.375rem 0.75rem",
                            background: "transparent",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            color: "var(--text-secondary)",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                          }}
                        >
                          Edit
                        </button>
                        <button
                          style={{
                            padding: "0.375rem 0.75rem",
                            background: "transparent",
                            border: "1px solid rgba(248,113,113,0.3)",
                            borderRadius: 6,
                            color: "#f87171",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                          }}
                        >
                          Suspend
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
