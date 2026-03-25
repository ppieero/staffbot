"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const FIELD_STYLE = {
  width: "100%",
  padding: "0.5rem 0.875rem",
  background: "var(--bg-base)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  boxSizing: "border-box" as const,
};

const LABEL_STYLE = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  active:     { bg: "rgba(74,222,128,0.08)",  color: "#4ade80", border: "rgba(74,222,128,0.25)"  },
  onboarding: { bg: "rgba(96,165,250,0.08)",  color: "#60a5fa", border: "rgba(96,165,250,0.25)"  },
  inactive:   { bg: "rgba(100,116,139,0.08)", color: "#64748b", border: "rgba(100,116,139,0.25)" },
};

type AssignedProfile = {
  id: string;
  profileId: string;
  profileName: string;
  isPrimary: boolean;
  telegramGroupId: number | null;
  telegramGroupName: string | null;
  assignedAt: string;
};

type AvailableProfile = { id: string; name: string };

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();

  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [success, setSuccess]             = useState(false);
  const [linkCode, setLinkCode]           = useState<{ code: string; expires: string } | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [sendingWelcome, setSendingWelcome] = useState(false);
  const [welcomeResult, setWelcomeResult]   = useState<{ ok: boolean; msg: string } | null>(null);
  const [addingProfile, setAddingProfile] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState("");

  const [form, setForm] = useState({
    profileId:        "",
    firstName:        "",
    lastName:         "",
    phoneWhatsapp:    "",
    email:            "",
    department:       "",
    telegramUserId:   "",
    languagePref:     "es",
    preferredChannel: "whatsapp",
    status:           "active" as "active" | "onboarding" | "inactive",
  });

  const { data: empData, isLoading, error: loadError } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => api.get(`/employees/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const { data: profilesData } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get("/profiles?limit=100").then((r) => r.data),
  });

  const { data: assignedData, refetch: refetchAssigned } = useQuery<{ data: AssignedProfile[] }>({
    queryKey: ["employee-profiles", id],
    queryFn: () => api.get(`/employees/${id}/profiles`).then((r) => r.data),
    enabled: !!id,
  });

  const allProfiles: AvailableProfile[]   = profilesData?.data ?? [];
  const assignedProfiles: AssignedProfile[] = assignedData?.data ?? [];
  const assignedIds = new Set(assignedProfiles.map((p) => p.profileId));
  const availableProfiles = allProfiles.filter((p) => !assignedIds.has(p.id));

  useEffect(() => {
    if (empData) {
      setForm({
        profileId:        empData.profileId ?? "",
        firstName:        empData.firstName ?? "",
        lastName:         empData.lastName ?? "",
        phoneWhatsapp:    empData.phoneWhatsapp ?? "",
        email:            empData.email ?? "",
        department:       empData.department ?? "",
        telegramUserId:   empData.telegramUserId ?? "",
        languagePref:     empData.languagePref ?? "es",
        preferredChannel: empData.preferredChannel ?? "whatsapp",
        status:           empData.status ?? "active",
      });
    }
  }, [empData]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSendWelcome() {
    setSendingWelcome(true);
    setWelcomeResult(null);
    try {
      const res = await api.post(`/employees/${id}/welcome`);
      const ch = res.data.channel === "telegram" ? "Telegram" : "WhatsApp";
      setWelcomeResult({ ok: true, msg: `Welcome message sent via ${ch}!` });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to send welcome message";
      setWelcomeResult({ ok: false, msg });
    } finally {
      setSendingWelcome(false);
      setTimeout(() => setWelcomeResult(null), 5000);
    }
  }

  async function handleGenerateTelegramLink() {
    setGeneratingLink(true);
    try {
      const res = await api.post(`/employees/${id}/telegram-link`);
      setLinkCode(res.data);
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string } } })?.response?.data;
      setError(data?.error ?? "Failed to generate link code");
    } finally {
      setGeneratingLink(false);
    }
  }

  async function handleResendVerification() {
    try {
      await api.post(`/employees/${id}/resend-verification`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string } } })?.response?.data;
      setError(data?.error ?? "Could not send verification code");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        firstName:        form.firstName.trim(),
        lastName:         form.lastName.trim(),
        languagePref:     form.languagePref,
        preferredChannel: form.preferredChannel,
      };
      if (form.profileId)           payload.profileId       = form.profileId;
      if (form.phoneWhatsapp.trim()) payload.phoneWhatsapp  = form.phoneWhatsapp.trim();
      if (form.email.trim())         payload.email          = form.email.trim();
      if (form.department.trim())    payload.department     = form.department.trim();
      if (form.telegramUserId.trim()) payload.telegramUserId = form.telegramUserId.trim();

      await api.put(`/employees/${id}`, payload);

      if (empData && form.status !== empData.status) {
        await api.patch(`/employees/${id}/status`, { status: form.status });
      }

      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee", id] });
      setSuccess(true);
      setTimeout(() => router.push("/dashboard/employees"), 800);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; message?: string; errors?: { msg: string }[] } } })?.response?.data;
      setError(
        data?.message ?? data?.error ??
        (data?.errors?.length ? data.errors.map((e) => e.msg).join(", ") : null) ??
        "Failed to update employee."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAddProfile() {
    if (!selectedProfileId) return;
    setAddingProfile(true);
    setError(null);
    try {
      const res = await api.post(`/employees/${id}/profiles`, {
        profileId: selectedProfileId,
        isPrimary: assignedProfiles.length === 0,
      });
      refetchAssigned();
      setSelectedProfileId("");
      const tg = res.data.telegramGroup;
      if (tg?.created) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string } } })?.response?.data;
      setError(data?.error ?? "Failed to assign profile");
    } finally {
      setAddingProfile(false);
    }
  }

  async function handleRemoveProfile(profileId: string) {
    try {
      await api.delete(`/employees/${id}/profiles/${profileId}`);
      refetchAssigned();
    } catch {
      setError("Failed to remove profile");
    }
  }

  async function handleSetPrimary(profileId: string) {
    try {
      await api.patch(`/employees/${id}/profiles/${profileId}/primary`);
      refetchAssigned();
    } catch {
      setError("Failed to set primary");
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <div style={{ width: 24, height: 24, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (loadError || !empData) {
    return (
      <div style={{ maxWidth: 640 }}>
        <button onClick={() => router.push("/dashboard/employees")} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.8125rem", cursor: "pointer", padding: 0, marginBottom: "1rem" }}>
          ← Employees
        </button>
        <div style={{ padding: "1rem", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, color: "#f87171", fontSize: "0.875rem" }}>
          Employee not found.
        </div>
      </div>
    );
  }

  const st = STATUS_COLORS[empData.status] ?? STATUS_COLORS.inactive;

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <button
          onClick={() => router.push("/dashboard/employees")}
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.8125rem", cursor: "pointer", padding: 0, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
        >
          ← Employees
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>
            {empData.firstName?.[0]}{empData.lastName?.[0]}
          </div>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
              {empData.firstName} {empData.lastName}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: 2, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, fontSize: "0.6875rem", fontWeight: 600, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.color, display: "inline-block" }} />
                {empData.status}
              </span>
              {empData.phoneWhatsapp && (
                empData.whatsappVerified ? (
                  <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: "0.6875rem", fontWeight: 600, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80" }}>
                    ✓ WhatsApp verified
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: "0.6875rem", fontWeight: 600, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24" }}>
                      ⚠ Unverified
                    </span>
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      style={{ padding: "2px 8px", borderRadius: 20, fontSize: "0.6875rem", fontWeight: 600, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent)", cursor: "pointer" }}
                    >
                      Send code
                    </button>
                  </span>
                )
              )}
              {empData.telegramUserId && (
                <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: "0.6875rem", fontWeight: 600, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80" }}>
                  ✓ Telegram linked
                </span>
              )}
              <button
                type="button"
                onClick={handleSendWelcome}
                disabled={sendingWelcome}
                title="Send welcome message via preferred channel"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "2px 8px", borderRadius: 20, fontSize: "0.6875rem", fontWeight: 600,
                  background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)",
                  color: "#4ade80", cursor: sendingWelcome ? "not-allowed" : "pointer",
                  opacity: sendingWelcome ? 0.6 : 1,
                }}
              >
                {sendingWelcome ? "Sending…" : "👋 Send Welcome"}
              </button>
            </div>
            {welcomeResult && (
              <div style={{
                marginTop: "0.5rem",
                padding: "0.5rem 0.75rem", borderRadius: 8, fontSize: "0.8rem",
                background: welcomeResult.ok ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
                border: `1px solid ${welcomeResult.ok ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
                color: welcomeResult.ok ? "#4ade80" : "#f87171",
              }}>
                {welcomeResult.msg}
              </div>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Basic info */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>Personal Info</h2>

            {/* Name */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={LABEL_STYLE}>First Name <span style={{ color: "#f87171" }}>*</span></label>
                <input type="text" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required style={FIELD_STYLE} />
              </div>
              <div>
                <label style={LABEL_STYLE}>Last Name <span style={{ color: "#f87171" }}>*</span></label>
                <input type="text" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required style={FIELD_STYLE} />
              </div>
            </div>

            {/* Email + Department */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={LABEL_STYLE}>Email</label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} style={FIELD_STYLE} />
              </div>
              <div>
                <label style={LABEL_STYLE}>Department</label>
                <input type="text" value={form.department} onChange={(e) => set("department", e.target.value)} style={FIELD_STYLE} />
              </div>
            </div>

            {/* Language + Status */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={LABEL_STYLE}>Language</label>
                <select value={form.languagePref} onChange={(e) => set("languagePref", e.target.value)} style={FIELD_STYLE}>
                  <option value="es">Spanish (es)</option>
                  <option value="en">English (en)</option>
                  <option value="pt">Portuguese (pt)</option>
                  <option value="fr">French (fr)</option>
                </select>
              </div>
              <div>
                <label style={LABEL_STYLE}>Status</label>
                <select value={form.status} onChange={(e) => set("status", e.target.value)} style={FIELD_STYLE}>
                  <option value="active">Active</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Communication Channel */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>Communication Channel</h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>
              The bot will only respond on the selected channel. One channel per employee.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {[
                { value: "whatsapp", label: "WhatsApp", icon: "💬", hint: "Responds via WhatsApp" },
                { value: "telegram", label: "Telegram",  icon: "✈️", hint: "Responds via Telegram" },
              ].map((ch) => (
                <div
                  key={ch.value}
                  onClick={() => set("preferredChannel", ch.value)}
                  style={{
                    flex: 1, padding: "1rem", borderRadius: 10, cursor: "pointer",
                    border: `2px solid ${form.preferredChannel === ch.value ? "var(--accent)" : "var(--border)"}`,
                    background: form.preferredChannel === ch.value ? "rgba(99,102,241,0.08)" : "transparent",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>{ch.icon}</div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: form.preferredChannel === ch.value ? "var(--accent)" : "var(--text-primary)" }}>
                    {ch.label}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{ch.hint}</div>
                </div>
              ))}
            </div>

            {/* WhatsApp number (shown regardless, needed for WA channel) */}
            <div style={{ maxWidth: "50%" }}>
              <label style={LABEL_STYLE}>WhatsApp Number</label>
              <input
                type="text"
                value={form.phoneWhatsapp}
                onChange={(e) => set("phoneWhatsapp", e.target.value.replace(/\D/g, ""))}
                placeholder="5491123456789"
                style={FIELD_STYLE}
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Digits only, with country code</p>
            </div>
          </div>

          {/* Telegram linking */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>Telegram</h2>
              {empData.telegramUserId
                ? <span style={{ fontSize: "0.75rem", color: "#4ade80" }}>✓ Linked (ID: {empData.telegramUserId})</span>
                : <span style={{ fontSize: "0.75rem", color: "#fbbf24" }}>⚠ Not linked</span>
              }
            </div>
            {empData.telegramUserId ? (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input value={empData.telegramUserId} readOnly style={{ ...FIELD_STYLE, opacity: 0.6, cursor: "not-allowed", flex: 1 }} />
                <button type="button" onClick={handleGenerateTelegramLink} disabled={generatingLink} style={{ padding: "0.5rem 0.875rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: "0.8125rem", cursor: "pointer", whiteSpace: "nowrap" }}>
                  Re-link
                </button>
              </div>
            ) : (
              <button type="button" onClick={handleGenerateTelegramLink} disabled={generatingLink} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, color: "var(--accent)", fontSize: "0.8125rem", fontWeight: 600, cursor: generatingLink ? "not-allowed" : "pointer", opacity: generatingLink ? 0.7 : 1 }}>
                {generatingLink ? "Generating…" : "🔗 Generate Link Code"}
              </button>
            )}
            {linkCode && (
              <div style={{ padding: "1rem", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Link Code</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Expires: {new Date(linkCode.expires).toLocaleTimeString()}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <code style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.1em", flex: 1 }}>
                    {linkCode.code}
                  </code>
                  <button type="button" onClick={() => navigator.clipboard.writeText(linkCode.code)} style={{ padding: "0.375rem 0.75rem", background: "var(--accent)", border: "none", borderRadius: 6, color: "#fff", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                    Copy
                  </button>
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  📱 Tell the employee to open <strong>@StaffBotApp_bot</strong> on Telegram and send this code.
                </p>
              </div>
            )}
          </div>

          {/* Assigned Profiles */}
          <div style={{ background: "var(--bg-card)", border: assignedProfiles.length > 0 ? "1px solid rgba(99,102,241,0.25)" : "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
                Assigned Profiles
                <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 20, background: "rgba(99,102,241,0.12)", color: "var(--accent)", fontWeight: 700 }}>
                  {assignedProfiles.length}
                </span>
              </h2>
            </div>

            {assignedProfiles.length === 0 ? (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>No profiles assigned yet. Assign at least one below.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {assignedProfiles.map((ap) => (
                  <div
                    key={ap.profileId}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.75rem",
                      padding: "0.75rem 1rem",
                      background: ap.isPrimary ? "rgba(99,102,241,0.06)" : "var(--bg-base)",
                      borderRadius: 8,
                      border: ap.isPrimary ? "1px solid rgba(99,102,241,0.25)" : "1px solid var(--border)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>{ap.profileName}</span>
                        {ap.isPrimary && (
                          <span style={{ fontSize: "0.6875rem", padding: "1px 7px", borderRadius: 20, background: "rgba(99,102,241,0.15)", color: "var(--accent)", fontWeight: 700, letterSpacing: "0.04em" }}>
                            PRIMARY
                          </span>
                        )}
                      </div>
                      {ap.telegramGroupId && (
                        <p style={{ fontSize: "0.75rem", color: "#4ade80", margin: "2px 0 0" }}>
                          ✓ Telegram notified: {ap.telegramGroupName}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}>
                      {!ap.isPrimary && (
                        <button
                          type="button"
                          onClick={() => handleSetPrimary(ap.profileId)}
                          style={{ padding: "0.3rem 0.625rem", background: "transparent", border: "1px solid rgba(99,102,241,0.35)", borderRadius: 6, color: "var(--accent)", fontSize: "0.75rem", cursor: "pointer" }}
                        >
                          Set Primary
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveProfile(ap.profileId)}
                        style={{ padding: "0.3rem 0.625rem", background: "transparent", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 6, color: "#f87171", fontSize: "0.75rem", cursor: "pointer" }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {availableProfiles.length > 0 && (
              <div style={{ display: "flex", gap: "0.625rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  style={{ ...FIELD_STYLE, flex: 1 }}
                >
                  <option value="">Assign additional profile…</option>
                  {availableProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddProfile}
                  disabled={!selectedProfileId || addingProfile}
                  style={{ padding: "0.5rem 1rem", background: "var(--accent)", border: "none", borderRadius: 7, color: "#fff", fontSize: "0.8125rem", fontWeight: 600, cursor: !selectedProfileId ? "not-allowed" : "pointer", opacity: !selectedProfileId ? 0.5 : 1, whiteSpace: "nowrap" }}
                >
                  {addingProfile ? "Adding…" : "+ Assign"}
                </button>
              </div>
            )}
          </div>

          {error && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, color: "#f87171", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 8, color: "#4ade80", fontSize: "0.875rem" }}>
              Saved!
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => router.push("/dashboard/employees")}
              style={{ padding: "0.5rem 1.125rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: "0.875rem", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ padding: "0.5rem 1.375rem", background: "var(--accent)", border: "none", borderRadius: 8, color: "#fff", fontSize: "0.875rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </form>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
