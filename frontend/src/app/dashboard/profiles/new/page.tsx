"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

let _fid = 0;

const LANGUAGES = [
  { value: "es", label: "Spanish" },
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "pt", label: "Portuguese" },
];

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / No" },
];

type CustomField = {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "date" | "boolean";
  required: boolean;
  placeholder: string;
  options: string;
};

type Tenant = { id: string; name: string; slug: string };

function newField(): CustomField {
  return { id: `field-${++_fid}`, label: "", type: "text", required: false, placeholder: "", options: "" };
}

export default function NewProfilePage() {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  useEffect(() => {
    setIsSuperAdmin(getCurrentUser()?.role === "super_admin");
  }, []);

  const [form, setForm] = useState({
    name: "",
    description: "",
    systemPrompt: "",
    language: "es",
    escalationContact: "",
    tenantId: "",
  });
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["tenants-list"],
    queryFn: () => api.get("/tenants").then((r) => r.data.data ?? r.data),
    enabled: isSuperAdmin,
  });

  function setField(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function addField() {
    setCustomFields((prev) => [...prev, newField()]);
  }

  function removeField(id: string) {
    setCustomFields((prev) => prev.filter((f) => f.id !== id));
  }

  function updateField(id: string, key: keyof CustomField, value: string | boolean) {
    setCustomFields((prev) => prev.map((f) => (f.id === id ? { ...f, [key]: value } : f)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSuperAdmin && !form.tenantId) {
      setError("Please select a tenant.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        systemPrompt: form.systemPrompt,
        language: form.language,
        escalationContact: form.escalationContact,
        customFields: customFields.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          required: f.required,
          placeholder: f.placeholder || undefined,
          options: f.type === "select" ? f.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
        })),
      };
      if (isSuperAdmin && form.tenantId) payload.tenantId = form.tenantId;

      await api.post("/profiles", payload);
      router.push("/dashboard/profiles");
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; error?: string; errors?: { msg: string }[] } } })?.response?.data;
      setError(
        data?.message ??
        data?.error ??
        (data?.errors?.length ? data.errors.map((e) => e.msg).join(", ") : null) ??
        "Failed to create profile."
      );
    } finally {
      setLoading(false);
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
    boxSizing: "border-box" as const,
  };

  const labelStyle = {
    display: "block" as const,
    marginBottom: "0.375rem",
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "var(--text-secondary)",
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: "1.75rem" }}>
        <button onClick={() => router.back()} style={{ display: "flex", alignItems: "center", gap: "0.375rem", background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: "0.875rem", cursor: "pointer", marginBottom: "0.75rem", padding: 0 }}>
          ← Back
        </button>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>New Profile</h1>
        <p style={{ marginTop: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Configure a chatbot persona for your employees.</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Basic info */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Basic info</h2>

          {isSuperAdmin && (
            <div>
              <label style={labelStyle}>Tenant <span style={{ color: "#f87171" }}>*</span></label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.tenantId} onChange={(e) => setField("tenantId", e.target.value)} required>
                <option value="">Select a tenant...</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id} style={{ background: "#1a1f2e" }}>{t.name} ({t.slug})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Profile name <span style={{ color: "#f87171" }}>*</span></label>
            <input style={inputStyle} value={form.name} onChange={(e) => setField("name", e.target.value)} required placeholder="e.g. HR Assistant" />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <input style={inputStyle} value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="Short description of this profile's purpose" />
          </div>

          <div>
            <label style={labelStyle}>
              System prompt
              <span style={{ marginLeft: "0.5rem", color: "var(--text-muted)", fontWeight: 400 }}>— defines the assistant&apos;s behavior</span>
            </label>
            <textarea
              style={{ ...inputStyle, minHeight: 200, resize: "vertical", lineHeight: 1.6, fontFamily: "var(--font-dm-mono)", fontSize: "0.8125rem" }}
              value={form.systemPrompt}
              onChange={(e) => setField("systemPrompt", e.target.value)}
              required
              placeholder={`You are a helpful HR assistant for {company_name}. Answer employee questions about policies, benefits, and procedures.\n\nBe professional, empathetic, and direct. If unsure, say so and offer to escalate.`}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>Language</label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.language} onChange={(e) => setField("language", e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value} style={{ background: "#1a1f2e" }}>{l.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Escalation contact</label>
              <input type="email" style={inputStyle} value={form.escalationContact} onChange={(e) => setField("escalationContact", e.target.value)} placeholder="hr@company.com" />
            </div>
          </div>
        </div>

        {/* Custom fields */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.75rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1rem" }}>
            <div>
              <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Custom fields</h2>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Extra data fields collected per employee for this profile.</p>
            </div>
            <button type="button" onClick={addField} style={{ padding: "0.375rem 0.875rem", background: "rgba(99,102,241,0.15)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 7, fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              + Add field
            </button>
          </div>

          {customFields.length === 0 && (
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>No custom fields. Click &quot;Add field&quot; to define extra data for employees.</p>
          )}

          {customFields.map((field, idx) => (
            <div key={field.id} style={{ padding: "1rem", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>Field {idx + 1}</span>
                <button type="button" onClick={() => removeField(field.id)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.125rem", lineHeight: 1, padding: "0 4px" }}>×</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <div>
                  <label style={labelStyle}>Label</label>
                  <input style={inputStyle} value={field.label} onChange={(e) => updateField(field.id, "label", e.target.value)} placeholder="e.g. Employee ID" />
                </div>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select style={{ ...inputStyle, cursor: "pointer" }} value={field.type} onChange={(e) => updateField(field.id, "type", e.target.value)}>
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value} style={{ background: "#1a1f2e" }}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: field.type === "select" ? "1fr 1fr" : "1fr auto", gap: "0.75rem", alignItems: "end" }}>
                <div>
                  <label style={labelStyle}>Placeholder</label>
                  <input style={inputStyle} value={field.placeholder} onChange={(e) => updateField(field.id, "placeholder", e.target.value)} placeholder="Optional hint text" />
                </div>
                {field.type === "select" && (
                  <div>
                    <label style={labelStyle}>Options <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(comma-separated)</span></label>
                    <input style={inputStyle} value={field.options} onChange={(e) => updateField(field.id, "options", e.target.value)} placeholder="Option A, Option B" />
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", paddingBottom: "0.625rem" }}>
                  <input type="checkbox" id={`req-${field.id}`} checked={field.required} onChange={(e) => updateField(field.id, "required", e.target.checked)} style={{ width: 15, height: 15, cursor: "pointer" }} />
                  <label htmlFor={`req-${field.id}`} style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>Required</label>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ padding: "0.625rem 0.875rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: "0.8125rem" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button type="button" onClick={() => router.back()} style={{ padding: "0.625rem 1.25rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: "0.875rem", cursor: "pointer" }}>
            Cancel
          </button>
          <button type="submit" disabled={loading} style={{ padding: "0.625rem 1.25rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Creating..." : "Create Profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
