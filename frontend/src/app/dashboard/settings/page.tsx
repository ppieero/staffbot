"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

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

type Tab = "profile" | "preferences" | "notifications" | "audit";

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
  const qc = useQueryClient();
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

  const set = (key: string, val: unknown) =>
    setForm((f) => ({ ...(f ?? {}), [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/users/me", form);
      qc.invalidateQueries({ queryKey: ["user-me"] });
      showToast("Settings saved", true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast(msg ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (pwForm.newPassword !== pwForm.confirmPassword)
      return showToast("New passwords don't match");
    if (pwForm.newPassword.length < 8)
      return showToast("Password must be at least 8 characters");
    setSaving(true);
    try {
      await api.put("/users/me/password", {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      showToast("Password changed", true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast(msg ?? "Password change failed");
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
      {saving ? "Saving…" : label}
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
    { id: "profile",       label: "Profile"       },
    { id: "preferences",   label: "Preferences"   },
    { id: "notifications", label: "Notifications" },
    { id: "audit",         label: "Audit Log"     },
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
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Settings</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          Manage your account and preferences
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
            {sectionTitle("Personal Information")}
            {twoCol(<>
              <div>
                {fieldLabel("First Name")}
                <input value={String(form.firstName ?? "")} onChange={(e) => set("firstName", e.target.value)} style={inputStyle} />
              </div>
              <div>
                {fieldLabel("Last Name")}
                <input value={String(form.lastName ?? "")} onChange={(e) => set("lastName", e.target.value)} style={inputStyle} />
              </div>
            </>)}
            <div>
              {fieldLabel("Email", "(contact your admin to change)")}
              <input value={String(form.email ?? "")} disabled style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} />
            </div>
            <div>
              {fieldLabel("Role")}
              <input value={String(form.role ?? "")} disabled style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} />
            </div>
            {saveBtn("Save Profile")}
          </>)}

          {card(<>
            {sectionTitle("Change Password")}
            <div>
              {fieldLabel("Current Password")}
              <input
                type="password" value={pwForm.currentPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
                style={inputStyle}
              />
            </div>
            {twoCol(<>
              <div>
                {fieldLabel("New Password", "(min 8 chars)")}
                <input
                  type="password" value={pwForm.newPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                {fieldLabel("Confirm New Password")}
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
              Change Password
            </button>
          </>)}
        </div>
      )}

      {/* ── Preferences tab ───────────────────────────────────────────────────── */}
      {form && tab === "preferences" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {card(<>
            {sectionTitle("Dashboard Preferences")}
            <div>
              {fieldLabel("Language")}
              <select value={String(form.languagePref ?? "es")} onChange={(e) => set("languagePref", e.target.value)} style={inputStyle}>
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              {fieldLabel("Timezone")}
              <select value={String(form.timezone ?? "America/Lima")} onChange={(e) => set("timezone", e.target.value)} style={inputStyle}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            {saveBtn("Save Preferences")}
          </>)}
        </div>
      )}

      {/* ── Notifications tab ─────────────────────────────────────────────────── */}
      {form && tab === "notifications" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {card(<>
            {sectionTitle("Notification Channels")}
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              Receive alerts on WhatsApp or Telegram when important events happen.
            </p>
            {twoCol(<>
              <div>
                {fieldLabel("WhatsApp Number", "(for notifications)")}
                <input
                  value={String(form.phoneWhatsapp ?? "")}
                  onChange={(e) => set("phoneWhatsapp", e.target.value)}
                  placeholder="51912345678"
                  style={inputStyle}
                />
              </div>
              <div>
                {fieldLabel("Telegram ID", "(username or numeric)")}
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
            {sectionTitle("Notification Events")}
            <Toggle
              fieldKey="notifyEscalations"
              label="Escalated Conversations"
              hint="Alert when an employee conversation is escalated to HR"
            />
            <Toggle
              fieldKey="notifyNewEmployees"
              label="New Employee Registered"
              hint="Alert when a new employee is added to your company"
            />
            <Toggle
              fieldKey="notifyWhatsapp"
              label="Send via WhatsApp"
              hint="Receive notifications on your WhatsApp number"
            />
            <Toggle
              fieldKey="notifyTelegram"
              label="Send via Telegram"
              hint="Receive notifications on your Telegram account"
            />
            {saveBtn("Save Notifications")}
          </>)}
        </div>
      )}

      {/* ── Audit Log tab ─────────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {sectionTitle("Audit Log")}
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>Page {auditPage}</span>
            </div>

            {!auditData ? (
              <div style={{ padding: "3rem", textAlign: "center" }}>
                <div style={{ width: 20, height: 20, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
              </div>
            ) : auditData.data?.length === 0 ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                No audit logs yet
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
              ← Prev
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
              Next →
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
