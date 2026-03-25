"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

interface DashboardStats {
  employees: number;
  profiles:  number;
  documents: number;
  messages:  number;
  msgTrend:  number;
  recentConversations: {
    id:            string;
    status:        string;
    lastMessageAt: string;
    startedAt:     string;
    employeeFirst: string;
    employeeLast:  string;
    profileName:   string;
  }[];
}

const STAT_CARDS = [
  {
    key:   "employees" as const,
    label: "Total Employees",
    href:  "/dashboard/employees",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    key:   "profiles" as const,
    label: "Active Profiles",
    href:  "/dashboard/profiles",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      </svg>
    ),
  },
  {
    key:   "documents" as const,
    label: "Documents Indexed",
    href:  "/dashboard/documents",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
  },
  {
    key:   "messages" as const,
    label: "Messages This Month",
    href:  "/dashboard/conversations",
    showTrend: true,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

function getHour() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DashboardPage() {
  const router = useRouter();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn:  () => api.get("/dashboard/stats").then((r) => r.data),
    refetchInterval: 30_000,
    retry: false,
  });

  const recentConvs = stats?.recentConversations ?? [];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
          {getHour()}, Admin 👋
        </h1>
        <p style={{ marginTop: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Here&apos;s what&apos;s happening with StaffBot today.
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        {STAT_CARDS.map((card) => {
          const value   = stats?.[card.key];
          const trend   = card.showTrend ? (stats?.msgTrend ?? 0) : null;
          const trendUp = trend !== null && trend >= 0;

          return (
            <div
              key={card.key}
              onClick={() => router.push(card.href)}
              style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: 12, padding: "1.25rem", cursor: "pointer",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 500 }}>
                  {card.label}
                </span>
                <div style={{
                  width: 36, height: 36, background: "rgba(99,102,241,0.1)",
                  borderRadius: 8, display: "flex", alignItems: "center",
                  justifyContent: "center", color: "var(--accent)",
                }}>
                  {card.icon}
                </div>
              </div>

              <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
                {isLoading ? (
                  <div style={{ width: 48, height: 32, background: "var(--border)", borderRadius: 6 }} />
                ) : (
                  (value ?? 0).toLocaleString()
                )}
              </div>

              {trend !== null && !isLoading && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: trendUp ? "#4ade80" : "#f87171", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  {trendUp ? "↑" : "↓"} {Math.abs(trend)}% vs last month
                </div>
              )}
              {trend === null && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  &nbsp;
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent conversations */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12 }}>
        <div style={{
          padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>
            Recent Conversations
          </h2>
          <a href="/dashboard/conversations" style={{ fontSize: "0.8125rem", color: "var(--accent)", textDecoration: "none" }}>
            View all →
          </a>
        </div>

        <div>
          {isLoading ? (
            // Skeleton rows
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem 1.5rem", borderBottom: i < 3 ? "1px solid var(--border)" : "none" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--border)", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ width: 120, height: 14, background: "var(--border)", borderRadius: 4, marginBottom: 6 }} />
                  <div style={{ width: 200, height: 12, background: "var(--border)", borderRadius: 4, opacity: 0.6 }} />
                </div>
              </div>
            ))
          ) : recentConvs.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>💬</div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No conversations yet</p>
            </div>
          ) : (
            recentConvs.map((conv, i) => (
              <div
                key={conv.id}
                onClick={() => router.push("/dashboard/conversations")}
                style={{
                  display: "flex", alignItems: "center", gap: "1rem",
                  padding: "0.875rem 1.5rem", cursor: "pointer",
                  borderBottom: i < recentConvs.length - 1 ? "1px solid var(--border)" : "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
              >
                {/* Avatar */}
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(99,102,241,0.15)", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: "0.75rem", fontWeight: 700, color: "var(--accent)", flexShrink: 0,
                }}>
                  {(conv.employeeFirst?.[0] ?? "")}{(conv.employeeLast?.[0] ?? "")}
                </div>

                {/* Name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)" }}>
                    {conv.employeeFirst} {conv.employeeLast}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: 2 }}>
                    {conv.status}
                  </div>
                </div>

                {/* Profile badge + time */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <span style={{
                    display: "inline-block", padding: "2px 8px",
                    background: "rgba(99,102,241,0.1)", color: "#a5b4fc",
                    borderRadius: 4, fontSize: "0.6875rem", fontWeight: 500,
                  }}>
                    {conv.profileName}
                  </span>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                    {timeAgo(conv.lastMessageAt ?? conv.startedAt)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
