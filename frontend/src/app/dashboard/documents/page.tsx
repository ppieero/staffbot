"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type IndexingStatus = "pending" | "processing" | "indexed" | "error";

interface Doc {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  indexingStatus: IndexingStatus;
  chunkCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  profileId: string;
}

interface Profile {
  id: string;
  name: string;
  language: string;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FILE_ICONS: Record<string, string> = {
  pdf: "📄", docx: "📝", doc: "📝", txt: "📃", xlsx: "📊", xls: "📊", url: "🔗",
};

const STATUS: Record<IndexingStatus, { label: string; bg: string; color: string; border: string }> = {
  pending:    { label: "Pending",    bg: "rgba(251,191,36,0.08)",  color: "#fbbf24", border: "rgba(251,191,36,0.25)" },
  processing: { label: "Processing", bg: "rgba(96,165,250,0.08)",  color: "#60a5fa", border: "rgba(96,165,250,0.25)" },
  indexed:    { label: "Indexed",    bg: "rgba(74,222,128,0.08)",  color: "#4ade80", border: "rgba(74,222,128,0.25)" },
  error:      { label: "Error",      bg: "rgba(248,113,113,0.08)", color: "#f87171", border: "rgba(248,113,113,0.25)" },
};

const LANG_FLAGS: Record<string, string> = { es: "🇪🇸", en: "🇬🇧", fr: "🇫🇷", pt: "🇵🇹" };

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1_048_576).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "error" | "ok" } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: profilesData, isLoading: loadingProfiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get("/profiles?limit=100").then((r) => r.data),
  });

  const { data: docsData, isLoading: loadingDocs } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.get("/documents?limit=200").then((r) => r.data),
  });

  const profiles: Profile[] = profilesData?.data ?? [];
  const docs: Doc[]         = docsData?.data ?? [];

  // Group documents by profileId
  const docsByProfile = docs.reduce<Record<string, Doc[]>>((acc, d) => {
    (acc[d.profileId] ??= []).push(d);
    return acc;
  }, {});

  const totalDocs = docs.length;
  const isLoading = loadingProfiles || loadingDocs;

  // ── Auto-poll while any doc is pending/processing ─────────────────────────

  const hasActive = docs.some(
    (d) => d.indexingStatus === "processing" || d.indexingStatus === "pending"
  );

  useEffect(() => {
    if (hasActive) {
      pollRef.current = setInterval(() => qc.invalidateQueries({ queryKey: ["documents"] }), 5000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [hasActive, qc]);

  // ── Toast ──────────────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string, type: "error" | "ok" = "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Upload ─────────────────────────────────────────────────────────────────

  const uploadFiles = useCallback(async (profileId: string, files: FileList | File[]) => {
    const allowed = new Set(["pdf", "docx", "doc", "txt", "xlsx", "xls"]);
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowed.has(ext)) { showToast(`.${ext} files are not supported`); continue; }
      if (file.size > 50 * 1024 * 1024) { showToast(`${file.name} exceeds the 50 MB limit`); continue; }

      setUploading((u) => ({ ...u, [profileId]: true }));
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("profileId", profileId);
        await api.post("/documents/upload", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        qc.invalidateQueries({ queryKey: ["documents"] });
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Upload failed";
        showToast(msg);
      } finally {
        setUploading((u) => ({ ...u, [profileId]: false }));
      }
    }
  }, [qc, showToast]);

  // ── Delete ─────────────────────────────────────────────────────────────────

  const deleteDoc = useCallback(async (id: string) => {
    try {
      await api.delete(`/documents/${id}`);
      qc.invalidateQueries({ queryKey: ["documents"] });
      showToast("Document deleted", "ok");
    } catch {
      showToast("Delete failed");
    }
    setConfirmDelete(null);
  }, [qc, showToast]);

  // ── Reindex ────────────────────────────────────────────────────────────────

  const reindex = useCallback(async (id: string) => {
    try {
      await api.post(`/documents/${id}/reindex`);
      qc.invalidateQueries({ queryKey: ["documents"] });
      showToast("Reindex queued", "ok");
    } catch {
      showToast("Reindex failed");
    }
  }, [qc, showToast]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240 }}>
        <div style={{
          width: 24, height: 24, border: "2px solid var(--accent)",
          borderTopColor: "transparent", borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            Documents
          </h1>
          <p style={{ marginTop: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Upload manuals and policies per position profile
          </p>
        </div>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}>
          {totalDocs} file{totalDocs !== 1 ? "s" : ""} total
        </span>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          marginBottom: "1.25rem", padding: "0.75rem 1rem",
          background: toast.type === "error" ? "rgba(248,113,113,0.1)" : "rgba(74,222,128,0.1)",
          border: `1px solid ${toast.type === "error" ? "rgba(248,113,113,0.3)" : "rgba(74,222,128,0.3)"}`,
          borderRadius: 8, fontSize: "0.8125rem",
          color: toast.type === "error" ? "#f87171" : "#4ade80",
        }}>
          <span style={{ flex: 1 }}>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "1rem", lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Empty state */}
      {profiles.length === 0 ? (
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "4rem", textAlign: "center",
        }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📁</div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            No profiles yet — create a position profile first.
          </p>
          <button
            onClick={() => router.push("/dashboard/profiles/new")}
            style={{
              padding: "0.5rem 1.25rem", background: "var(--accent)", color: "#fff",
              border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
            }}
          >
            Create Profile
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {profiles.map((profile) => {
            const profileDocs = (docsByProfile[profile.id] ?? []).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            const isUploading = uploading[profile.id];

            return (
              <div key={profile.id} style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: 12, overflow: "hidden",
              }}>
                {/* Profile header row */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                    <span style={{ fontSize: "1.125rem" }}>{LANG_FLAGS[profile.language] ?? "🌐"}</span>
                    <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text-primary)" }}>
                      {profile.name}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {profileDocs.length} file{profileDocs.length !== 1 ? "s" : ""}
                    </span>
                    {profile.status !== "active" && (
                      <span style={{
                        fontSize: "0.6875rem", padding: "1px 6px",
                        background: "rgba(100,116,139,0.15)", color: "var(--text-muted)",
                        borderRadius: 4,
                      }}>
                        {profile.status}
                      </span>
                    )}
                  </div>

                  {/* Upload button */}
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.doc,.txt,.xlsx,.xls"
                    style={{ display: "none" }}
                    ref={(el) => { fileRefs.current[profile.id] = el; }}
                    onChange={(e) => e.target.files && uploadFiles(profile.id, e.target.files)}
                  />
                  <button
                    onClick={() => fileRefs.current[profile.id]?.click()}
                    disabled={isUploading}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.375rem",
                      padding: "0.4rem 0.875rem", background: "var(--accent)",
                      color: "#fff", border: "none", borderRadius: 7,
                      fontSize: "0.8125rem", fontWeight: 600,
                      cursor: isUploading ? "not-allowed" : "pointer",
                      opacity: isUploading ? 0.6 : 1,
                    }}
                  >
                    {isUploading ? (
                      <span style={{
                        width: 12, height: 12, border: "2px solid #fff",
                        borderTopColor: "transparent", borderRadius: "50%",
                        display: "inline-block", animation: "spin 0.8s linear infinite",
                      }} />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    )}
                    Upload
                  </button>
                </div>

                {/* Drop zone + file list */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(profile.id); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(null); uploadFiles(profile.id, e.dataTransfer.files); }}
                  style={{ background: dragOver === profile.id ? "rgba(99,102,241,0.04)" : "transparent", transition: "background 0.15s" }}
                >
                  {profileDocs.length === 0 ? (
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      justifyContent: "center", padding: "2.5rem 1rem", margin: "1rem",
                      border: `2px dashed ${dragOver === profile.id ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: 10, transition: "border-color 0.15s",
                    }}>
                      <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>📂</div>
                      <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        Drop files here or click Upload
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        PDF, DOCX, TXT, XLSX · max 50 MB
                      </p>
                    </div>
                  ) : (
                    <>
                      {profileDocs.map((doc, i) => {
                        const ext  = doc.fileType ?? doc.fileName.split(".").pop() ?? "";
                        const icon = FILE_ICONS[ext.toLowerCase()] ?? "📄";
                        const st   = STATUS[doc.indexingStatus] ?? STATUS.pending;

                        return (
                          <div key={doc.id} style={{
                            display: "flex", alignItems: "center", gap: "0.875rem",
                            padding: "0.75rem 1.25rem",
                            borderBottom: i < profileDocs.length - 1 ? "1px solid var(--border)" : "none",
                            transition: "background 0.1s",
                          }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            {/* Icon */}
                            <span style={{ fontSize: "1.25rem", flexShrink: 0 }}>{icon}</span>

                            {/* Name + meta */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{
                                fontSize: "0.875rem", fontWeight: 500,
                                color: "var(--text-primary)", overflow: "hidden",
                                textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>
                                {doc.name}
                              </p>
                              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                                {fmtSize(doc.fileSizeBytes)} · {fmtDate(doc.createdAt)}
                                {doc.chunkCount != null && ` · ${doc.chunkCount} chunks`}
                              </p>
                              {doc.errorMessage && (
                                <p style={{ fontSize: "0.75rem", color: "#f87171", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {doc.errorMessage}
                                </p>
                              )}
                            </div>

                            {/* Status badge */}
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              padding: "3px 10px", borderRadius: 20,
                              fontSize: "0.6875rem", fontWeight: 600, whiteSpace: "nowrap",
                              background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                            }}>
                              {doc.indexingStatus === "processing" && (
                                <span style={{
                                  width: 6, height: 6, borderRadius: "50%",
                                  background: st.color, display: "inline-block",
                                  animation: "pulse 1.2s ease-in-out infinite",
                                }} />
                              )}
                              {st.label}
                            </span>

                            {/* Actions */}
                            <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
                              {doc.indexingStatus === "error" && (
                                <button
                                  onClick={() => reindex(doc.id)}
                                  title="Reindex"
                                  style={{
                                    padding: "0.3rem 0.5rem", background: "transparent",
                                    border: "1px solid rgba(251,191,36,0.3)", borderRadius: 6,
                                    color: "#fbbf24", fontSize: "0.8125rem", cursor: "pointer",
                                  }}
                                >
                                  ↻
                                </button>
                              )}

                              {confirmDelete === doc.id ? (
                                <div style={{ display: "flex", gap: "0.25rem" }}>
                                  <button
                                    onClick={() => deleteDoc(doc.id)}
                                    style={{
                                      padding: "0.3rem 0.625rem", background: "#dc2626",
                                      border: "none", borderRadius: 6, color: "#fff",
                                      fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                                    }}
                                  >
                                    Delete
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    style={{
                                      padding: "0.3rem 0.625rem", background: "transparent",
                                      border: "1px solid var(--border)", borderRadius: 6,
                                      color: "var(--text-secondary)", fontSize: "0.75rem", cursor: "pointer",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(doc.id)}
                                  title="Delete"
                                  style={{
                                    padding: "0.3rem 0.5rem", background: "transparent",
                                    border: "1px solid transparent", borderRadius: 6,
                                    color: "var(--text-muted)", fontSize: "0.875rem", cursor: "pointer",
                                    transition: "all 0.15s",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "#f87171";
                                    e.currentTarget.style.borderColor = "rgba(248,113,113,0.3)";
                                    e.currentTarget.style.background = "rgba(248,113,113,0.08)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "var(--text-muted)";
                                    e.currentTarget.style.borderColor = "transparent";
                                    e.currentTarget.style.background = "transparent";
                                  }}
                                >
                                  🗑
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Drop-over hint at bottom */}
                      {dragOver === profile.id && (
                        <div style={{
                          padding: "0.75rem", textAlign: "center",
                          fontSize: "0.8125rem", color: "var(--accent)",
                          background: "rgba(99,102,241,0.06)",
                          borderTop: "1px dashed var(--accent)",
                        }}>
                          Drop to upload
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>
    </div>
  );
}
