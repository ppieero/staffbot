"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import api from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

interface NotionConn {
  connected: boolean;
  workspaceName?: string;
  workspaceIcon?: string | null;
  connectedAt?: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "long", year: "numeric" });
}

export default function SettingsIntegracionesPage() {
  const router = useRouter();
  const { t }  = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const { data: notion, isLoading } = useQuery<NotionConn>({
    queryKey: ["notion-status"],
    queryFn: () => api.get("/integrations/notion").then((r) => r.data),
  });

  const startOAuth = useMutation({
    mutationFn: () => api.get("/integrations/notion/auth").then((r) => r.data as { url: string }),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: () => setError("No se pudo iniciar la conexión con Notion. Verifica la configuración del servidor."),
  });

  const steps = [
    {
      n: "1",
      title: t("integ.step1.title"),
      body:  t("integ.step1.body"),
      tip:   null as string | null,
    },
    {
      n: "2",
      title: t("integ.step2.title"),
      body:  t("integ.step2.body"),
      tip:   t("integ.step2.tip"),
    },
    {
      n: "3",
      title: t("integ.step3.title"),
      body:  t("integ.step3.body"),
      tip:   t("integ.step3.tip"),
    },
    {
      n: "4",
      title: t("integ.step4.title"),
      body:  t("integ.step4.body"),
      tip:   null as string | null,
    },
  ];

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <button
          onClick={() => router.push("/dashboard/settings")}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-secondary)", fontSize: "0.8125rem",
            padding: 0, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 4,
          }}
        >
          {t("integ.back")}
        </button>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
          {t("integ.title")}
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          {t("integ.subtitle")}
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          marginBottom: "1rem", padding: "10px 16px", borderRadius: 8,
          background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
          color: "#f87171", fontSize: "0.8125rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#f87171", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* Notion card */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {/* Card header */}
        <div style={{
          padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}>
            {notion?.connected && notion.workspaceIcon ? notion.workspaceIcon : "📋"}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Notion
            </p>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              {t("integ.notion.desc")}
            </p>
          </div>
          {isLoading ? null : notion?.connected ? (
            <span style={{
              fontSize: "0.75rem", fontWeight: 600, padding: "3px 10px", borderRadius: 20,
              background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80",
            }}>
              {t("notion.connected")}
            </span>
          ) : (
            <span style={{
              fontSize: "0.75rem", fontWeight: 600, padding: "3px 10px", borderRadius: 20,
              background: "rgba(100,116,139,0.12)", border: "1px solid rgba(100,116,139,0.25)", color: "#64748b",
            }}>
              {t("notion.notConnected")}
            </span>
          )}
        </div>

        {/* Connected state */}
        {notion?.connected ? (
          <div style={{ padding: "1.25rem" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 12, marginBottom: 20,
            }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-primary)", fontWeight: 500 }}>
                  {t("notion.workspace")}: <strong>{notion.workspaceName}</strong>
                </p>
                {notion.connectedAt && (
                  <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {t("integ.connectedSince")} {fmtDate(notion.connectedAt)}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => startOAuth.mutate()}
                  disabled={startOAuth.isPending}
                  style={{
                    padding: "8px 14px", borderRadius: 8, fontSize: "0.8125rem", cursor: "pointer", fontWeight: 500,
                    background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa",
                    opacity: startOAuth.isPending ? 0.6 : 1,
                  }}
                >
                  {t("integ.reconnect")}
                </button>
                <button
                  onClick={() => router.push("/dashboard/integraciones/notion")}
                  style={{
                    padding: "8px 16px", borderRadius: 8, fontSize: "0.8125rem", cursor: "pointer", fontWeight: 600,
                    background: "var(--accent)", border: "none", color: "#fff",
                  }}
                >
                  {t("integ.manage")}
                </button>
              </div>
            </div>

            {/* Tip for connected state */}
            <div style={{
              padding: "12px 16px", borderRadius: 10,
              background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)",
              fontSize: "0.8125rem", color: "#a5b4fc", lineHeight: 1.6,
            }}>
              <strong>{t("integ.tipReconnectTitle")}</strong>{" "}
              {t("integ.tipReconnectBody")}
            </div>
          </div>
        ) : (
          /* Not connected — full setup guide */
          <div style={{ padding: "1.5rem 1.25rem" }}>
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {t("integ.setupHint")}
            </p>

            {/* Steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: "1.5rem" }}>
              {steps.map((s, i) => (
                <div key={s.n} style={{ display: "flex", gap: 0 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 32, flexShrink: 0 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%",
                      background: "rgba(99,102,241,0.12)", border: "1.5px solid rgba(99,102,241,0.35)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.75rem", fontWeight: 700, color: "#a5b4fc", flexShrink: 0,
                    }}>
                      {s.n}
                    </div>
                    {i < steps.length - 1 && (
                      <div style={{ width: 1.5, flex: 1, minHeight: 10, background: "rgba(99,102,241,0.18)", margin: "4px 0" }} />
                    )}
                  </div>
                  <div style={{ paddingLeft: 14, paddingBottom: i < steps.length - 1 ? 20 : 0 }}>
                    <p style={{ margin: "3px 0 3px", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {s.title}
                    </p>
                    <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {s.body}
                    </p>
                    {s.tip && (
                      <div style={{
                        marginTop: 8, padding: "8px 12px", borderRadius: 8,
                        background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)",
                        fontSize: "0.775rem", color: "#fbbf24", lineHeight: 1.5,
                      }}>
                        💡 {s.tip}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => startOAuth.mutate()}
              disabled={startOAuth.isPending}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
                background: "var(--accent)", color: "#fff", fontSize: "0.9375rem",
                fontWeight: 700, cursor: startOAuth.isPending ? "not-allowed" : "pointer",
                opacity: startOAuth.isPending ? 0.7 : 1,
              }}
            >
              {startOAuth.isPending ? t("integ.connectingBtn") : t("integ.connectBtn")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
