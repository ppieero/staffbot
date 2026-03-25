"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

type Employee = {
  id: string;
  tenantId: string;
  profileId: string;
  firstName: string;
  lastName: string;
  phoneWhatsapp: string | null;
  email: string | null;
  department: string | null;
  status: "active" | "onboarding" | "inactive";
  languagePref: string;
  whatsappVerified: boolean;
  createdAt: string;
  profile: { id: string; name: string } | null;
  tenantName: string | null;
};

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  active:     { bg: "rgba(74,222,128,0.08)",  color: "#4ade80", border: "rgba(74,222,128,0.25)"  },
  onboarding: { bg: "rgba(96,165,250,0.08)",  color: "#60a5fa", border: "rgba(96,165,250,0.25)"  },
  inactive:   { bg: "rgba(100,116,139,0.08)", color: "#64748b", border: "rgba(100,116,139,0.25)" },
};

export default function EmployeesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [profileFilter, setProfileFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const u = getCurrentUser();
    setIsSuperAdmin(u?.role === "super_admin");
  }, []);

  const { data: empData, isLoading, error } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.get("/employees?limit=200").then((r) => r.data),
  });

  const { data: profilesData } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get("/profiles?limit=100").then((r) => r.data),
  });

  const employees: Employee[] = empData?.data ?? [];
  const profiles: { id: string; name: string }[] = profilesData?.data ?? [];

  const filtered = employees.filter((e) => {
    const name = `${e.firstName} ${e.lastName}`.toLowerCase();
    const q = search.toLowerCase();
    if (search && !name.includes(q) && !e.email?.toLowerCase().includes(q) && !(e.phoneWhatsapp ?? "").includes(search)) return false;
    if (profileFilter !== "all" && e.profileId !== profileFilter) return false;
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    return true;
  });

  return (
    <div style={{ maxWidth: 1040 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>Employees</h1>
          <p style={{ marginTop: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            {isLoading ? "Loading…" : `${filtered.length} of ${employees.length} employee${employees.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard/employees/new")}
          style={{ padding: "0.5rem 1.125rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
        >
          + New Employee
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search name, email, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: "0.5rem 0.875rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: "0.875rem", outline: "none" }}
        />
        <select
          value={profileFilter}
          onChange={(e) => setProfileFilter(e.target.value)}
          style={{ padding: "0.5rem 0.875rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: "0.875rem", cursor: "pointer", outline: "none" }}
        >
          <option value="all">All profiles</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "0.5rem 0.875rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: "0.875rem", cursor: "pointer", outline: "none" }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="onboarding">Onboarding</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* States */}
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <div style={{ width: 24, height: 24, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : error ? (
        <div style={{ padding: "1rem", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, color: "#f87171", fontSize: "0.875rem" }}>
          Failed to load employees
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "4rem", textAlign: "center" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>👥</div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            {employees.length === 0 ? "No employees yet" : "No results match your filters"}
          </p>
          {employees.length === 0 && (
            <button
              onClick={() => router.push("/dashboard/employees/new")}
              style={{ padding: "0.5rem 1.25rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
            >
              Add First Employee
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {/* Header row */}
          <div style={{ display: "grid", gridTemplateColumns: isSuperAdmin ? "2fr 1.2fr 1.4fr 1.4fr 1fr 1fr 72px" : "2fr 1.4fr 1.4fr 1fr 1fr 72px", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)", fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
            <span>Employee</span>
            {isSuperAdmin && <span>Company</span>}
            <span>WhatsApp</span><span>Profile</span><span>Dept</span><span>Status</span><span />
          </div>

          {filtered.map((emp, i) => {
            const st = STATUS_COLORS[emp.status] ?? STATUS_COLORS.inactive;
            return (
              <div
                key={emp.id}
                style={{ display: "grid", gridTemplateColumns: isSuperAdmin ? "2fr 1.2fr 1.4fr 1.4fr 1fr 1fr 72px" : "2fr 1.4fr 1.4fr 1fr 1fr 72px", padding: "0.875rem 1.25rem", alignItems: "center", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none", transition: "background 0.1s", cursor: "pointer" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                onClick={() => router.push(`/dashboard/employees/${emp.id}`)}
              >
                {/* Name + email */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8125rem", fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>
                    {emp.firstName[0]}{emp.lastName[0]}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.875rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {emp.firstName} {emp.lastName}
                    </p>
                    {emp.email && (
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{emp.email}</p>
                    )}
                  </div>
                </div>

                {/* Company — super_admin only */}
                {isSuperAdmin && (
                  <span style={{ fontSize: "0.75rem", color: emp.tenantName ? "var(--text-secondary)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {emp.tenantName ?? "—"}
                  </span>
                )}

                {/* WhatsApp */}
                <span style={{ fontSize: "0.8125rem", color: emp.phoneWhatsapp ? "var(--text-primary)" : "var(--text-muted)", fontFamily: emp.phoneWhatsapp ? "var(--font-dm-mono)" : "inherit" }}>
                  {emp.phoneWhatsapp ? (
                    <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      +{emp.phoneWhatsapp}
                      {emp.whatsappVerified
                        ? <span title="Verified" style={{ color: "#4ade80", fontSize: "0.75rem" }}>✓</span>
                        : <span title="Unverified" style={{ color: "#fbbf24", fontSize: "0.75rem" }}>⚠</span>
                      }
                    </span>
                  ) : "—"}
                </span>

                {/* Profile */}
                <span style={{ fontSize: "0.8125rem", color: emp.profile?.name ? "var(--accent)" : "var(--text-muted)", background: emp.profile?.name ? "rgba(99,102,241,0.08)" : "transparent", padding: emp.profile?.name ? "2px 7px" : "0", borderRadius: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {emp.profile?.name ?? "—"}
                </span>

                {/* Department */}
                <span style={{ fontSize: "0.8125rem", color: emp.department ? "var(--text-secondary)" : "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {emp.department ?? "—"}
                </span>

                {/* Status */}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20, fontSize: "0.6875rem", fontWeight: 600, background: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: "nowrap" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.color, display: "inline-block" }} />
                  {emp.status}
                </span>

                {/* Edit */}
                <button
                  onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/employees/${emp.id}`); }}
                  style={{ padding: "0.3rem 0.625rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-secondary)", fontSize: "0.75rem", cursor: "pointer" }}
                >
                  Edit
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
