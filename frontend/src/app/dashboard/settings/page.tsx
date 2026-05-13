"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { setLang, useTranslation, type Lang } from "@/lib/i18n";

const LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "pt", label: "Português" },
];

const TIMEZONES = [
  "America/Lima",
  "America/Bogota",
  "America/Santiago",
  "America/Buenos_Aires",
  "America/Mexico_City",
  "America/New_York",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/London",
];

type Tab = "profile" | "preferences" | "notifications" | "integrations" | "audit";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  create: { bg: "rgba(74,222,128,0.08)",  color: "#4ade80" },
  update: { bg: "rgba(96,165,250,0.08)",  color: "#60a5fa" },
  delete: { bg: "rgba(248,113,113,0.08)", color: "#f87171" },
  login:  { bg: "rgba(251,191,36,0.08)",  color: "#fbbf24" },
};

export default function SettingsPage() {
  const { t }   = useTranslation();
  const qc = useQueryClient();
  const router = useRouter();
  const [tab, setTab]       = useState<Tab>("profile");
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState<{ msg: string; ok?: boolean } | null>(null);
  const [form, setForm]     = useState<Record<string, unknown> | null>(null);
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [auditPage, setAuditPage] = useState(1);

  const showToast = (msg: string, ok = false) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const { data: user } = useQuery({
    queryKey: ["user-me"],
    queryFn: () => api.get("/users/me").then((r) => r.data),
  });

  // Populate form once user data arrives (only on first load)
  useEffect(() => {
    if (user && !form) setForm({ ...user });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: auditData } = useQuery({
    queryKey: ["audit-logs", auditPage],
    queryFn: () => api.get(`/users/audit-logs?page=${auditPage}&limit=20`).then((r) => r.data),
    enabled: tab === "audit",
  });

  const { data: notionConn } = useQuery<{ connected: boolean; workspaceName?: string; workspaceIcon?: string | null }>({
    queryKey: ["notion-status"],
    queryFn: () => api.get("/integrations/notion").then((r) => r.data),
    enabled: tab === "integrations",
  });

  const set = (key: string, val: unknown) =>
    setForm((f) => ({ ...(f ?? {}), [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/users/me", form);
      qc.invalidateQueries({ queryKey: ["user-me"] });
      if (form?.languagePref) setLang(form.languagePref as Lang);
      showToast(t("settings.saved"), true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast(msg ?? t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (pwForm.newPassword !== pwForm.confirmPassword)
      return showToast(t("settings.pwMismatch"));
    if (pwForm.newPassword.length < 8)
      return showToast(t("settings.pwTooShort"));
    setSaving(true);
    try {
      await api.put("/users/me/password", {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      showToast(t("settings.pwChanged"), true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast(msg ?? t("settings.pwChangeFailed"));
    } finally {
      setSaving(false);
    }
  };

  // ── Style helpers ────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.5rem 0.75rem",
    background: "var(--bg-main)", border: "1px solid var(--border)",
    borderRadius: 7, color: "var(--text-primary)", fontSize: "0.875rem",
    outline: "none", boxSizing: "border-box",
  };

  const fieldLabel = (text: string, hint?: string) => (
    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
      {text}
      {hint && <span style={{ fontWeight: 400, marginLeft: 4 }}>{hint}</span>}
    </label>
  );

  const twoCol = (children: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>{children}</div>
  );

  const card = (children: React.ReactNode) => (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "1.25rem",
      display: "flex", flexDirection: "column", gap: "1rem",
    }}>
      {children}
    </div>
  );

  const sectionTitle = (text: string) => (
    <h2 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
      {text}
    </h2>
  );

  const saveBtn = (label: string) => (
    <button
      onClick={handleSave} disabled={saving}
      style={{
        padding: "0.625rem 1.25rem", background: "var(--accent)", color: "#fff",
        border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600,
        cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
        alignSelf: "flex-start",
      }}
    >
      {saving ? t("settings.saving") : label}
    </button>
  );

  const Toggle = ({ fieldKey, label, hint }: { fieldKey: string; label: string; hint: string }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 0", borderBottom: "1px solid var(--border)" }}>
      <div>
        <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>{label}</p>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{hint}</p>
      </div>
      <div
        onClick={() => set(fieldKey, !form?.[fieldKey])}
        style={{
          width: 44, height: 24, borderRadius: 12, cursor: "pointer", flexShrink: 0,
          background: form?.[fieldKey] ? "var(--accent)" : "var(--border)",
          transition: "background 0.2s", position: "relative",
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 3,
          left: form?.[fieldKey] ? 23 : 3,
          transition: "left 0.2s",
        }} />
      </div>
    </div>
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile",       label: t("settings.tab.profile")       },
    { id: "preferences",   label: t("settings.tab.preferences")   },
    { id: "notifications", label: t("settings.tab.notifications") },
    { id: "integrations",  label: t("settings.tab.integrations")  },
    { id: "audit",         label: t("settings.tab.audit")         },
  ];

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "1.25rem", right: "1.25rem", zIndex: 100,
          padding: "0.75rem 1.25rem", borderRadius: 8, fontSize: "0.875rem", fontWeight: 500,
          background: toast.ok ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
          border: `1px solid ${toast.ok ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
          color: toast.ok ? "#4ade80" : "#f87171",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{t("settings.title")}</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          {t("settings.subtitle")}
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex", gap: "0.25rem", marginBottom: "1.5rem",
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "0.25rem",
      }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: "0.5rem 0.75rem", borderRadius: 8,
              border: "none", cursor: "pointer",
              background: tab === t.id ? "var(--accent)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--text-secondary)",
              fontSize: "0.8125rem", fontWeight: 600, transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Profile tab ───────────────────────────────────────────────────────── */}
      {form && tab === "profile" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {card(<>
            {sectionTitle(t("settings.profile.section"))}
            {twoCol(<>
              <div>
                {fieldLabel(t("settings.profile.firstName"))}
                <input value={String(form.firstName ?? "")} onChange={(e) => set("firstName", e.target.value)} style={inputStyle} />
              </div>
              <div>
                {fieldLabel(t("settings.profile.lastName"))}
                <input value={String(form.lastName ?? "")} onChange={(e) => set("lastName", e.target.value)} style={inputStyle} />
              </div>
            </>)}
            <div>
              {fieldLabel(t("settings.profile.email"), t("settings.profile.emailHint"))}
              <input value={String(form.email ?? "")} disabled style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} />
            </div>
            <div>
              {fieldLabel(t("settings.profile.role"))}
              <input value={String(form.role ?? "")} disabled style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} />
            </div>
            {saveBtn(t("settings.profile.save"))}
          </>)}

          {card(<>
            {sectionTitle(t("settings.password.section"))}
            <div>
              {fieldLabel(t("settings.password.current"))}
              <input
                type="password" value={pwForm.currentPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
                style={inputStyle}
              />
            </div>
            {twoCol(<>
              <div>
                {fieldLabel(t("settings.password.new"), t("settings.password.newHint"))}
                <input
                  type="password" value={pwForm.newPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                {fieldLabel(t("settings.password.confirm"))}
                <input
                  type="password" value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            </>)}
            <button
              onClick={handlePasswordChange} disabled={saving}
              style={{
                padding: "0.625rem 1.25rem", background: "transparent",
                color: "var(--accent)", border: "1px solid rgba(99,102,241,0.4)",
                borderRadius: 8, fontSize: "0.875rem", fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer", alignSelf: "flex-start",
              }}
            >
              {t("settings.password.change")}
            </button>
          </>)}
        </div>
      )}

      {/* ── Preferences tab ───────────────────────────────────────────────────── */}
      {form && tab === "preferences" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {card(<>
            {sectionTitle(t("settings.prefs.section"))}
            <div>
              {fieldLabel(t("settings.prefs.language"))}
              <select value={String(form.languagePref ?? "es")} onChange={(e) => set("languagePref", e.target.value)} style={inputStyle}>
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              {fieldLabel(t("settings.prefs.timezone"))}
              <select value={String(form.timezone ?? "America/Lima")} onChange={(e) => set("timezone", e.target.value)} style={inputStyle}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            {saveBtn(t("settings.prefs.save"))}
          </>)}
        </div>
      )}

      {/* ── Notifications tab ─────────────────────────────────────────────────── */}
      {form && tab === "notifications" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {card(<>
            {sectionTitle(t("settings.notif.channels"))}
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              {t("settings.notif.channelsHint")}
            </p>
            {twoCol(<>
              <div>
                {fieldLabel(t("settings.notif.whatsapp"), t("settings.notif.whatsappHint"))}
                <input
                  value={String(form.phoneWhatsapp ?? "")}
                  onChange={(e) => set("phoneWhatsapp", e.target.value)}
                  placeholder="51912345678"
                  style={inputStyle}
                />
              </div>
              <div>
                {fieldLabel(t("settings.notif.telegram"), t("settings.notif.telegramHint"))}
                <input
                  value={String(form.telegramId ?? "")}
                  onChange={(e) => set("telegramId", e.target.value)}
                  placeholder="@username"
                  style={inputStyle}
                />
              </div>
            </>)}
          </>)}

          {card(<>
            {sectionTitle(t("settings.notif.events"))}
            <Toggle
              fieldKey="notifyEscalations"
              label={t("settings.notif.escalations")}
              hint={t("settings.notif.escalationsHint")}
            />
            <Toggle
              fieldKey="notifyNewEmployees"
              label={t("settings.notif.newEmployees")}
              hint={t("settings.notif.newEmployeesHint")}
            />
            <Toggle
              fieldKey="notifyWhatsapp"
              label={t("settings.notif.viaWhatsapp")}
              hint={t("settings.notif.viaWhatsappHint")}
            />
            <Toggle
              fieldKey="notifyTelegram"
              label={t("settings.notif.viaTelegram")}
              hint={t("settings.notif.viaTelegramHint")}
            />
            {saveBtn(t("settings.notif.save"))}
          </>)}
        </div>
      )}

      {/* ── Integrations tab ──────────────────────────────────────────────────── */}
      {tab === "integrations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Notion card */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
              <p style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Notion
              </p>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                {t("settings.integ.notionDesc")}
              </p>
            </div>
            <div style={{ padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              {notionConn?.connected ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {notionConn.workspaceIcon && <span style={{ fontSize: 22 }}>{notionConn.workspaceIcon}</span>}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{
                        display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                        background: "#4ade80",
                      }} />
                      <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        {t("settings.integ.connectedLabel")} {notionConn.workspaceName}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {t("settings.integ.manageHint")}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{
                      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                      background: "#64748b",
                    }} />
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      {t("notion.notConnected")}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {t("settings.integ.notConnectedHint")}
                  </p>
                </div>
              )}
              <button
                onClick={() => router.push("/dashboard/settings/integraciones")}
                style={{
                  padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--accent)", color: "#fff", fontSize: "0.8125rem",
                  fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {notionConn?.connected ? t("settings.integ.manage") : t("settings.integ.configure")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Audit Log tab ─────────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {sectionTitle(t("settings.tab.audit"))}
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>{t("settings.audit.page")} {auditPage}</span>
            </div>

            {!auditData ? (
              <div style={{ padding: "3rem", textAlign: "center" }}>
                <div style={{ width: 20, height: 20, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
              </div>
            ) : auditData.data?.length === 0 ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                {t("settings.audit.noLogs")}
              </div>
            ) : (
              auditData.data?.map((log: {
                id: string; action: string; entityType?: string; entityId?: string;
                oldValue?: unknown; newValue?: unknown; ipAddress?: string;
                createdAt: string; userEmail?: string; userFirst?: string; userLast?: string;
              }, i: number) => {
                const actionType = log.action?.split("_")[0] ?? "create";
                const ac = ACTION_COLORS[actionType] ?? ACTION_COLORS.create;
                const actor = [log.userFirst, log.userLast].filter(Boolean).join(" ") || log.userEmail || "System";
                return (
                  <div
                    key={log.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: "0.875rem",
                      padding: "0.75rem 1.25rem",
                      borderBottom: i < auditData.data.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <span style={{
                      padding: "2px 8px", borderRadius: 6, fontSize: "0.6875rem", fontWeight: 700,
                      background: ac.bg, color: ac.color, whiteSpace: "nowrap", flexShrink: 0, marginTop: 2,
                    }}>
                      {log.action}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.8125rem", color: "var(--text-primary)", margin: 0 }}>
                        {log.entityType && (
                          <span style={{ color: "var(--text-muted)" }}>{log.entityType} · </span>
                        )}
                        {actor}
                      </p>
                      {log.newValue != null ? (
                        <p style={{
                          fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 2,
                          fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {JSON.stringify(log.newValue)}
                        </p>
                      ) : null}
                    </div>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "monospace" }}>
                      {fmtDate(log.createdAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem" }}>
            <button
              onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
              disabled={auditPage === 1}
              style={{
                padding: "0.375rem 0.875rem", background: "var(--bg-card)",
                border: "1px solid var(--border)", borderRadius: 7,
                color: "var(--text-secondary)", fontSize: "0.8125rem",
                cursor: auditPage === 1 ? "not-allowed" : "pointer", opacity: auditPage === 1 ? 0.5 : 1,
              }}
            >
              {t("settings.audit.prev")}
            </button>
            <button
              onClick={() => setAuditPage((p) => p + 1)}
              disabled={!auditData?.data?.length || auditData.data.length < 20}
              style={{
                padding: "0.375rem 0.875rem", background: "var(--bg-card)",
                border: "1px solid var(--border)", borderRadius: 7,
                color: "var(--text-secondary)", fontSize: "0.8125rem",
                cursor: !auditData?.data?.length || auditData.data.length < 20 ? "not-allowed" : "pointer",
                opacity: !auditData?.data?.length || auditData.data.length < 20 ? 0.5 : 1,
              }}
            >
              {t("settings.audit.next")}
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
