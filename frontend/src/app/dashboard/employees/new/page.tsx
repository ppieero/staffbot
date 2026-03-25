"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

type Profile = { id: string; name: string };

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

export default function NewEmployeePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    profileId: "",
    firstName: "",
    lastName: "",
    phoneWhatsapp: "",
    email: "",
    department: "",
    languagePref: "es",
    status: "active" as "active" | "onboarding" | "inactive",
  });

  const { data: profilesData } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get("/profiles?limit=100").then((r) => r.data),
  });
  const profiles: Profile[] = profilesData?.data ?? [];

  // Pre-select first profile if only one
  useEffect(() => {
    if (profiles.length === 1 && !form.profileId) {
      setForm((f) => ({ ...f, profileId: profiles[0].id }));
    }
  }, [profiles]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        profileId: form.profileId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        languagePref: form.languagePref,
        status: form.status,
      };
      if (form.phoneWhatsapp.trim()) payload.phoneWhatsapp = form.phoneWhatsapp.trim();
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.department.trim()) payload.department = form.department.trim();

      await api.post("/employees", payload);
      router.push("/dashboard/employees");
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; message?: string; errors?: { msg: string }[] } } })?.response?.data;
      setError(
        data?.message ?? data?.error ??
        (data?.errors?.length ? data.errors.map((e) => e.msg).join(", ") : null) ??
        "Failed to create employee."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <button
          onClick={() => router.push("/dashboard/employees")}
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.8125rem", cursor: "pointer", padding: 0, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
        >
          ← Employees
        </button>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>New Employee</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Profile */}
          <div>
            <label style={LABEL_STYLE}>Profile <span style={{ color: "#f87171" }}>*</span></label>
            <select
              value={form.profileId}
              onChange={(e) => set("profileId", e.target.value)}
              required
              style={FIELD_STYLE}
            >
              <option value="">Select a profile…</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Name row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={LABEL_STYLE}>First Name <span style={{ color: "#f87171" }}>*</span></label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                required
                placeholder="John"
                style={FIELD_STYLE}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Last Name <span style={{ color: "#f87171" }}>*</span></label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                required
                placeholder="Doe"
                style={FIELD_STYLE}
              />
            </div>
          </div>

          {/* WhatsApp */}
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

          {/* Telegram — link code flow */}
          <div style={{ padding: "0.75rem 1rem", background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 8 }}>
            <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--accent)", marginBottom: "0.25rem" }}>💬 Telegram</p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              After creating the employee, open their profile and click <strong>&quot;Generate Link Code&quot;</strong> to get a one-time code they can send to <strong>@StaffBotApp_bot</strong>.
            </p>
          </div>

          {/* Email + Department */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={LABEL_STYLE}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="john@company.com"
                style={FIELD_STYLE}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Department</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
                placeholder="Sales"
                style={FIELD_STYLE}
              />
            </div>
          </div>

          {/* Language + Status */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={LABEL_STYLE}>Language</label>
              <select value={form.languagePref} onChange={(e) => set("languagePref", e.target.value)} style={FIELD_STYLE}>
                <option value="es">Spanish (es)</option>
                <option value="en">English (en)</option>
                <option value="fr">French (fr)</option>
                <option value="pt">Portuguese (pt)</option>
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

          {error && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, color: "#f87171", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", paddingTop: "0.25rem" }}>
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
              {saving ? "Creating…" : "Create Employee"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
