"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

type Profile = {
  id: string;
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  name: string;
  description: string | null;
  language: string;
  status: "active" | "inactive";
  employeeCount: number;
  documentCount: number;
};

type Tenant = { id: string; name: string; slug: string };

const LANG_LABELS: Record<string, string> = {
  es: "Spanish",
  en: "English",
  fr: "French",
  pt: "Portuguese",
};

export default function ProfilesPage() {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

  useEffect(() => {
    setIsSuperAdmin(getCurrentUser()?.role === "super_admin");
  }, []);

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["tenants-list"],
    queryFn: () => api.get("/tenants").then((r) => r.data.data ?? r.data),
    enabled: isSuperAdmin,
  });

  const { data, isLoading, error } = useQuery<{ data: Profile[] }>({
    queryKey: ["profiles", selectedTenantId],
    queryFn: () => {
      const params = isSuperAdmin && selectedTenantId ? `?tenantId=${selectedTenantId}` : "";
      return api.get(`/profiles?limit=200${params ? "&" + params.slice(1) : ""}`).then((r) => r.data);
    },
  });

  const profiles = data?.data ?? [];

  // Group profiles by tenantId
  const grouped = profiles.reduce<Record<string, { tenantName: string; tenantSlug: string; profiles: Profile[] }>>((acc, p) => {
    const key = p.tenantId ?? "unknown";
    if (!acc[key]) {
      acc[key] = { tenantName: p.tenantName ?? "Unknown", tenantSlug: p.tenantSlug ?? "", profiles: [] };
    }
    acc[key].profiles.push(p);
    return acc;
  }, {});

  const groupEntries = Object.entries(grouped);
  const showGroups = isSuperAdmin && !selectedTenantId && groupEntries.length > 1;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.75rem", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            Profiles
          </h1>
          <p style={{ marginTop: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            {isLoading ? "Loading..." : `${profiles.filter((p) => p.status === "active").length} active profiles`}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {isSuperAdmin && (
            <select
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              style={{
                padding: "0.5rem 0.75rem",
                background: "#1a1f2e",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              <option value="">All tenants</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => router.push("/dashboard/profiles/new")}
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
            New Profile
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Failed to load profiles. Check your connection and try again.
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 160, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, opacity: 0.4 }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && profiles.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
          <p style={{ fontSize: "0.9375rem" }}>No profiles yet.</p>
          <p style={{ fontSize: "0.8125rem", marginTop: "0.25rem" }}>Create your first profile to get started.</p>
        </div>
      )}

      {/* Cards — grouped by tenant when super_admin and no filter selected */}
      {!isLoading && profiles.length > 0 && (
        showGroups ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            {groupEntries.map(([tenantId, group]) => (
              <div key={tenantId}>
                {/* Tenant group header */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.875rem", paddingBottom: "0.625rem", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    {group.tenantName}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}>
                    {group.tenantSlug}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {group.profiles.length} profile{group.profiles.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <ProfileGrid profiles={group.profiles} router={router} isSuperAdmin={false} />
              </div>
            ))}
          </div>
        ) : (
          <ProfileGrid profiles={profiles} router={router} isSuperAdmin={isSuperAdmin} />
        )
      )}
    </div>
  );
}

function ProfileGrid({ profiles, router, isSuperAdmin }: { profiles: Profile[]; router: ReturnType<typeof useRouter>; isSuperAdmin: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
      {profiles.map((profile) => (
        <div
          key={profile.id}
          onClick={() => router.push(`/dashboard/profiles/${profile.id}`)}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.875rem",
            transition: "border-color 0.15s, box-shadow 0.15s",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)";
            e.currentTarget.style.boxShadow = "0 0 0 1px rgba(99,102,241,0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {/* Top row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
              </svg>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "3px 10px", background: profile.status === "active" ? "rgba(74,222,128,0.1)" : "rgba(100,116,139,0.1)", color: profile.status === "active" ? "#4ade80" : "var(--text-muted)", borderRadius: 20, fontSize: "0.6875rem", fontWeight: 600 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
              {profile.status === "active" ? "Active" : "Inactive"}
            </div>
          </div>

          {/* Name & description */}
          <div>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>
              {profile.name}
            </h3>
            {/* Tenant name — shown when a specific tenant is selected or in a flat list */}
            {isSuperAdmin && profile.tenantName && (
              <p style={{ marginTop: "0.125rem", fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}>
                {profile.tenantName}
              </p>
            )}
            {profile.description && (
              <p style={{ marginTop: "0.25rem", fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {profile.description}
              </p>
            )}
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: "0.75rem", paddingTop: "0.875rem", borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              </svg>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}>
                {Number(profile.employeeCount ?? 0)}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}>
                {Number(profile.documentCount ?? 0)}
              </span>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", padding: "2px 7px", border: "1px solid var(--border)", borderRadius: 4 }}>
                {LANG_LABELS[profile.language] ?? profile.language}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
