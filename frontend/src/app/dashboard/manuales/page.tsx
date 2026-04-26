"use client";
import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  published:  { bg: "rgba(74,222,128,0.1)",  color: "#4ade80", label: "Published" },
  generating: { bg: "rgba(251,191,36,0.1)",  color: "#fbbf24", label: "Generating…" },
  pending:    { bg: "rgba(96,165,250,0.1)",  color: "#60a5fa", label: "Pending" },
  error:      { bg: "rgba(248,113,113,0.1)", color: "#f87171", label: "Error" },
  draft:      { bg: "rgba(148,163,184,0.1)", color: "#94a3b8", label: "Draft" },
};

interface Manual {
  id:             string;
  title:          string;
  slug:           string;
  status:         string;
  language:       string | null;
  sourceFileName: string | null;
  createdAt:      string;
  tenantSlug:     string;
}

export default function ManualesPage() {
  const qc           = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"docs" | "videos">("docs");
  const [uploading, setUploading]   = useState(false);
  const [toast, setToast]           = useState<{ msg: string; ok?: boolean } | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");

  const showToast = (msg: string, ok = false) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const { data, isLoading } = useQuery<{ data: Manual[] }>({
    queryKey: ["manuals"],
    queryFn:  () => api.get("/manuals").then(r => r.data),
    refetchInterval: 8000,
  });

  const manualsList: Manual[] = data?.data ?? [];
  const hasGenerating = manualsList.some(m => m.status === "generating" || m.status === "pending");

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return showToast("Please select a PDF or DOCX file");

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", uploadTitle.trim() || file.name.replace(/\.[^/.]+$/, ""));
      await api.post("/manuals/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      qc.invalidateQueries({ queryKey: ["manuals"] });
      setShowUpload(false);
      setUploadTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      showToast("Manual generation started — ready in ~1 minute", true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/manuals/${id}`);
      qc.invalidateQueries({ queryKey: ["manuals"] });
      showToast("Manual deleted", true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || "Delete failed");
    }
  };

  const copyLink = (manual: Manual) => {
    const url = `${window.location.origin}/m/${manual.tenantSlug}/${manual.slug}`;
    navigator.clipboard.writeText(url).then(() => showToast("Link copied!", true));
  };

  const card: React.CSSProperties = {
    background:   "var(--bg-card)",
    border:       "1px solid var(--border)",
    borderRadius: 12,
    padding:      "1rem 1.25rem",
  };

  return (
    <div style={{ maxWidth: 900 }}>
      {toast && (
        <div style={{
          position:   "fixed",
          top:        "1.25rem",
          right:      "1.25rem",
          zIndex:     100,
          padding:    "0.75rem 1.25rem",
          borderRadius: 8,
          fontSize:   "0.875rem",
          fontWeight: 500,
          background: toast.ok ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
          border:     `1px solid ${toast.ok ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
          color:      toast.ok ? "#4ade80" : "#f87171",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)" }}>Manuales</h1>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            AI-generated web manuals for your team
          </p>
        </div>
        {tab === "docs" && (
          <button
            onClick={() => setShowUpload(true)}
            style={{ padding: "0.5rem 1.25rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
          >
            + Create manual
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.5rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "0.25rem" }}>
        {([
          { id: "docs",   label: "Documents" },
          { id: "videos", label: "Videos (coming soon)" },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex:       1,
              padding:    "0.5rem 0.75rem",
              borderRadius: 8,
              border:     "none",
              cursor:     "pointer",
              background: tab === t.id ? "var(--accent)" : "transparent",
              color:      tab === t.id ? "#fff" : "var(--text-secondary)",
              fontSize:   "0.8125rem",
              fontWeight: 600,
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div style={{ ...card, marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "1rem" }}>
            Upload PDF to generate manual
          </h2>
          <form onSubmit={handleUpload}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  Manual title (optional)
                </label>
                <input
                  value={uploadTitle}
                  onChange={e => setUploadTitle(e.target.value)}
                  placeholder="e.g. Housekeeping Operations Manual"
                  style={{ width: "100%", padding: "0.5rem 0.75rem", background: "var(--bg-main)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  PDF or DOCX file
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}
                />
              </div>
              <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 8, padding: "0.75rem" }}>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                  Claude will analyze the document and generate a structured web manual with sections, numbered steps, checklists and notes. Generation takes ~1 minute.
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => { setShowUpload(false); setUploadTitle(""); }}
                  style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: "0.875rem", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  style={{ padding: "0.5rem 1.25rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.7 : 1 }}
                >
                  {uploading ? "Uploading…" : "Generate manual"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Generating notice */}
      {hasGenerating && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.625rem 1rem", marginBottom: "1rem", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", animation: "pulse 1.5s ease-in-out infinite" }} />
          <span style={{ fontSize: "0.8125rem", color: "#fbbf24", fontWeight: 500 }}>Claude is generating a manual… page auto-refreshes</span>
        </div>
      )}

      {/* Documents tab */}
      {tab === "docs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
          ) : manualsList.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: "3rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📖</div>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>No manuals yet</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
                Upload a PDF and Claude will generate a structured web manual for your team
              </p>
              <button
                onClick={() => setShowUpload(true)}
                style={{ padding: "0.625rem 1.5rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
              >
                + Create first manual
              </button>
            </div>
          ) : (
            manualsList.map(m => {
              const st = STATUS_STYLE[m.status] ?? STATUS_STYLE.draft;
              return (
                <div key={m.id} style={card}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>{m.title}</span>
                        <span style={{ fontSize: "0.6875rem", padding: "2px 8px", borderRadius: 20, background: st.bg, color: st.color, fontWeight: 600 }}>
                          {st.label}
                        </span>
                        {m.language && (
                          <span style={{ fontSize: "0.6875rem", padding: "2px 6px", borderRadius: 4, background: "rgba(99,102,241,0.1)", color: "var(--accent)", fontWeight: 600 }}>
                            {m.language.toUpperCase()}
                          </span>
                        )}
                      </div>

                      {m.sourceFileName && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                          Source: {m.sourceFileName} · {new Date(m.createdAt).toLocaleDateString()}
                        </div>
                      )}

                      {(m.status === "generating" || m.status === "pending") && (
                        <div style={{ marginTop: "0.5rem" }}>
                          <div style={{ background: "var(--border)", borderRadius: 99, height: 4, overflow: "hidden", maxWidth: 220 }}>
                            <div style={{ height: "100%", background: "var(--accent)", borderRadius: 99, animation: "progress 2s ease-in-out infinite" }} />
                          </div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 3 }}>Claude is generating your manual…</div>
                        </div>
                      )}

                      {m.status === "published" && (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                          <code style={{ fontSize: "0.6875rem", background: "var(--bg-main)", padding: "2px 8px", borderRadius: 4, color: "var(--text-muted)" }}>
                            /m/{m.tenantSlug}/{m.slug}
                          </code>
                          <button
                            onClick={() => copyLink(m)}
                            style={{ fontSize: "0.6875rem", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}
                          >
                            Copy link
                          </button>
                          <a
                            href={`/m/${m.tenantSlug}/${m.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: "0.6875rem", padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.08)", color: "var(--accent)", textDecoration: "none" }}
                          >
                            Preview →
                          </a>
                        </div>
                      )}

                      {m.status === "error" && (
                        <div style={{ fontSize: "0.75rem", color: "#f87171", marginTop: "0.375rem" }}>
                          Generation failed — try uploading again
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleDelete(m.id, m.title)}
                      style={{ padding: "0.3rem 0.75rem", borderRadius: 7, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)", color: "#f87171", fontSize: "0.75rem", cursor: "pointer", flexShrink: 0 }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Videos tab */}
      {tab === "videos" && (
        <div style={{ ...card, textAlign: "center", padding: "4rem 2rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎬</div>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
            Video training library
          </h3>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
            Upload training videos, tutorials and demos for your team. Coming soon.
          </p>
          <span style={{ display: "inline-block", fontSize: "0.75rem", padding: "4px 12px", borderRadius: 20, background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)", fontWeight: 600 }}>
            Coming soon
          </span>
        </div>
      )}

      <style>{`
        @keyframes progress {
          0%   { width: 10%; }
          50%  { width: 75%; }
          100% { width: 10%; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
