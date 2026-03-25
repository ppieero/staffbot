"use client";

import { useState, useRef, FormEvent, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomField = {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "date" | "boolean";
  required: boolean;
  placeholder?: string;
  options?: string[];
};

type Profile = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  language: string;
  escalationContact: string | null;
  status: "active" | "inactive";
  customFields: CustomField[];
  stats: { documentCount: number; employeeCount: number; conversationCount: number };
};

type Document = {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number | null;
  indexingStatus: "pending" | "processing" | "indexed" | "error";
  errorMessage: string | null;
  chunkCount: number | null;
  createdAt: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

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

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:    { bg: "rgba(251,191,36,0.1)",  color: "#fbbf24" },
  processing: { bg: "rgba(99,102,241,0.15)", color: "#a5b4fc" },
  indexed:    { bg: "rgba(74,222,128,0.1)",  color: "#4ade80" },
  error:      { bg: "rgba(239,68,68,0.1)",   color: "#f87171" },
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

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

let _fid = 0;
function newField(): CustomField & { _options: string } {
  return { id: `cf-${++_fid}`, label: "", type: "text", required: false, placeholder: "", options: [], _options: "" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfileDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  getCurrentUser(); // available for future role-gated actions

  // ── Profile query ─────────────────────────────────────────────────────────

  const { data: profileData, isLoading: profileLoading, error: profileError } = useQuery<{ data: Profile }>({
    queryKey: ["profile", id],
    queryFn: () => api.get(`/profiles/${id}`).then((r) => r.data),
  });

  const profile = profileData?.data;

  // ── Edit form state (synced from profile once loaded) ─────────────────────

  type EditForm = {
    name: string;
    description: string;
    systemPrompt: string;
    language: string;
    escalationContact: string;
    customFields: Array<CustomField & { _options: string }>;
  };

  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initialise form once profile loads (only once)
  const formInitialised = useRef(false);
  if (profile && !formInitialised.current) {
    formInitialised.current = true;
    setEditForm({
      name: profile.name,
      description: profile.description ?? "",
      systemPrompt: profile.systemPrompt ?? "",
      language: profile.language,
      escalationContact: profile.escalationContact ?? "",
      customFields: (profile.customFields ?? []).map((f) => ({
        ...f,
        _options: f.options?.join(", ") ?? "",
      })),
    });
  }

  function setEditField(key: keyof Omit<EditForm, "customFields">, value: string) {
    setEditForm((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  function addCustomField() {
    setEditForm((prev) => prev ? { ...prev, customFields: [...prev.customFields, newField()] } : prev);
  }

  function removeCustomField(fid: string) {
    setEditForm((prev) => prev ? { ...prev, customFields: prev.customFields.filter((f) => f.id !== fid) } : prev);
  }

  function updateCustomField(fid: string, key: string, value: string | boolean) {
    setEditForm((prev) => {
      if (!prev) return prev;
      return { ...prev, customFields: prev.customFields.map((f) => f.id === fid ? { ...f, [key]: value } : f) };
    });
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!editForm) return;
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);
    try {
      await api.put(`/profiles/${id}`, {
        name: editForm.name,
        description: editForm.description,
        systemPrompt: editForm.systemPrompt,
        language: editForm.language,
        escalationContact: editForm.escalationContact,
        customFields: editForm.customFields.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          required: f.required,
          placeholder: f.placeholder || undefined,
          options: f.type === "select" ? f._options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
        })),
      });
      await qc.invalidateQueries({ queryKey: ["profile", id] });
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      setSaveError(e?.response?.data?.error ?? e?.response?.data?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // ── Status toggle ─────────────────────────────────────────────────────────

  const toggleStatusMut = useMutation({
    mutationFn: (status: "active" | "inactive") => api.patch(`/profiles/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", id] }),
  });

  // ── Documents ─────────────────────────────────────────────────────────────

  const { data: docsData, isLoading: docsLoading, refetch: refetchDocs } = useQuery<{ data: Document[] }>({
    queryKey: ["documents", id],
    queryFn: () => api.get(`/documents?profileId=${id}`).then((r) => r.data),
    enabled: !!profile,
  });

  const documents = docsData?.data ?? [];

  // Upload state
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("profileId", id);
      fd.append("name", file.name.replace(/\.[^.]+$/, ""));
      await api.post("/documents/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refetchDocs();
      await qc.invalidateQueries({ queryKey: ["profile", id] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setUploadError(e?.response?.data?.error ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, [id, refetchDocs, qc]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }

  const deleteDocMut = useMutation({
    mutationFn: (docId: string) => api.delete(`/documents/${docId}`),
    onSuccess: () => {
      refetchDocs();
      qc.invalidateQueries({ queryKey: ["profile", id] });
    },
  });

  // ── Render ────────────────────────────────────────────────────────────────

  if (profileLoading) {
    return (
      <div style={{ maxWidth: 760 }}>
        <div style={{ height: 32, width: 200, background: "var(--bg-card)", borderRadius: 8, marginBottom: "1.5rem", opacity: 0.5 }} />
        <div style={{ height: 400, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, opacity: 0.4 }} />
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div style={{ maxWidth: 760 }}>
        <button onClick={() => router.back()} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: "0.875rem", cursor: "pointer", marginBottom: "1rem", padding: 0 }}>← Back</button>
        <div style={{ padding: "2rem", textAlign: "center", color: "#f87171" }}>Profile not found or access denied.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Back + header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <button onClick={() => router.back()} style={{ display: "flex", alignItems: "center", gap: "0.375rem", background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: "0.875rem", cursor: "pointer", marginBottom: "0.75rem", padding: 0 }}>
          ← Profiles
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
              {profile.name}
            </h1>
            <div style={{ display: "flex", gap: "1rem", marginTop: "0.375rem" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                {profile.stats.employeeCount} employees · {profile.stats.documentCount} docs
              </span>
            </div>
          </div>
          <button
            onClick={() => toggleStatusMut.mutate(profile.status === "active" ? "inactive" : "active")}
            disabled={toggleStatusMut.isPending}
            style={{
              padding: "0.375rem 0.875rem",
              background: profile.status === "active" ? "rgba(74,222,128,0.1)" : "rgba(100,116,139,0.1)",
              color: profile.status === "active" ? "#4ade80" : "var(--text-muted)",
              border: `1px solid ${profile.status === "active" ? "rgba(74,222,128,0.3)" : "var(--border)"}`,
              borderRadius: 20,
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {profile.status === "active" ? "Active" : "Inactive"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* ── Edit form ──────────────────────────────────────────────────────── */}
        {editForm && (
          <form onSubmit={handleSave}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Profile settings</h2>

              <div>
                <label style={labelStyle}>Profile name <span style={{ color: "#f87171" }}>*</span></label>
                <input style={inputStyle} value={editForm.name} onChange={(e) => setEditField("name", e.target.value)} required />
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <input style={inputStyle} value={editForm.description} onChange={(e) => setEditField("description", e.target.value)} placeholder="Short description" />
              </div>

              <div>
                <label style={labelStyle}>
                  System prompt
                  <span style={{ marginLeft: "0.5rem", color: "var(--text-muted)", fontWeight: 400 }}>— defines the assistant&apos;s behavior</span>
                </label>
                <textarea
                  style={{ ...inputStyle, minHeight: 200, resize: "vertical", lineHeight: 1.6, fontFamily: "var(--font-dm-mono)", fontSize: "0.8125rem" }}
                  value={editForm.systemPrompt}
                  onChange={(e) => setEditField("systemPrompt", e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={labelStyle}>Language</label>
                  <select style={{ ...inputStyle, cursor: "pointer" }} value={editForm.language} onChange={(e) => setEditField("language", e.target.value)}>
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value} style={{ background: "#1a1f2e" }}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Escalation contact</label>
                  <input type="email" style={inputStyle} value={editForm.escalationContact} onChange={(e) => setEditField("escalationContact", e.target.value)} placeholder="hr@company.com" />
                </div>
              </div>

              {/* Custom fields */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <div>
                    <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Custom fields</p>
                    <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Extra data fields collected per employee.</p>
                  </div>
                  <button type="button" onClick={addCustomField} style={{ padding: "0.375rem 0.875rem", background: "rgba(99,102,241,0.15)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 7, fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                    + Add field
                  </button>
                </div>

                {editForm.customFields.length === 0 && (
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>No custom fields defined.</p>
                )}

                {editForm.customFields.map((field, idx) => (
                  <div key={field.id} style={{ padding: "1rem", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                      <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>Field {idx + 1}</span>
                      <button type="button" onClick={() => removeCustomField(field.id)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.125rem", lineHeight: 1, padding: "0 4px" }}>×</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                      <div>
                        <label style={labelStyle}>Label</label>
                        <input style={inputStyle} value={field.label} onChange={(e) => updateCustomField(field.id, "label", e.target.value)} placeholder="e.g. Employee ID" />
                      </div>
                      <div>
                        <label style={labelStyle}>Type</label>
                        <select style={{ ...inputStyle, cursor: "pointer" }} value={field.type} onChange={(e) => updateCustomField(field.id, "type", e.target.value)}>
                          {FIELD_TYPES.map((t) => (
                            <option key={t.value} value={t.value} style={{ background: "#1a1f2e" }}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: field.type === "select" ? "1fr 1fr" : "1fr auto", gap: "0.75rem", alignItems: "end" }}>
                      <div>
                        <label style={labelStyle}>Placeholder</label>
                        <input style={inputStyle} value={field.placeholder ?? ""} onChange={(e) => updateCustomField(field.id, "placeholder", e.target.value)} placeholder="Optional hint" />
                      </div>
                      {field.type === "select" && (
                        <div>
                          <label style={labelStyle}>Options <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(comma-sep.)</span></label>
                          <input style={inputStyle} value={field._options} onChange={(e) => updateCustomField(field.id, "_options", e.target.value)} placeholder="Option A, Option B" />
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", paddingBottom: "0.625rem" }}>
                        <input type="checkbox" id={`req-${field.id}`} checked={field.required} onChange={(e) => updateCustomField(field.id, "required", e.target.checked)} style={{ width: 15, height: 15, cursor: "pointer" }} />
                        <label htmlFor={`req-${field.id}`} style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>Required</label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Save row */}
              {saveError && (
                <div style={{ padding: "0.5rem 0.875rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: "0.8125rem" }}>
                  {saveError}
                </div>
              )}
              {saveSuccess && (
                <div style={{ padding: "0.5rem 0.875rem", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 8, color: "#4ade80", fontSize: "0.8125rem" }}>
                  Saved successfully.
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="submit" disabled={saving} style={{ padding: "0.625rem 1.25rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ── Documents ────────────────────────────────────────────────────── */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
            <div>
              <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Documents</h2>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                {documents.length} document{documents.length !== 1 ? "s" : ""} · PDF, DOCX, TXT, XLSX (max 50 MB)
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ padding: "0.5rem 1rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.8125rem", fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.7 : 1 }}
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.xlsx,.xls" style={{ display: "none" }} onChange={onFileChange} />
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 8,
              padding: "1.5rem",
              textAlign: "center",
              cursor: "pointer",
              marginBottom: documents.length ? "1.25rem" : 0,
              background: dragOver ? "rgba(99,102,241,0.05)" : "transparent",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 0.5rem" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              {uploading ? "Uploading…" : "Drop a file here, or click to select"}
            </p>
          </div>

          {uploadError && (
            <div style={{ padding: "0.5rem 0.875rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: "0.8125rem", marginTop: "0.75rem" }}>
              {uploadError}
            </div>
          )}

          {/* Document list */}
          {docsLoading && <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "1rem" }}>Loading documents…</div>}

          {!docsLoading && documents.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
              {documents.map((doc) => {
                const st = STATUS_STYLE[doc.indexingStatus] ?? STATUS_STYLE.pending;
                return (
                  <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {doc.name}
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                        {doc.fileType.toUpperCase()} · {formatBytes(doc.fileSizeBytes)}
                        {doc.chunkCount != null && ` · ${doc.chunkCount} chunks`}
                      </p>
                    </div>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: "0.6875rem", fontWeight: 600, background: st.bg, color: st.color, whiteSpace: "nowrap" }}>
                      {doc.indexingStatus}
                    </span>
                    {doc.indexingStatus === "error" && doc.errorMessage && (
                      <span title={doc.errorMessage} style={{ fontSize: "0.75rem", color: "#f87171", cursor: "help" }}>⚠</span>
                    )}
                    <button
                      onClick={() => { if (confirm(`Delete "${doc.name}"?`)) deleteDocMut.mutate(doc.id); }}
                      disabled={deleteDocMut.isPending}
                      style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0 4px", fontSize: "1rem", lineHeight: 1, flexShrink: 0 }}
                      title="Delete document"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
