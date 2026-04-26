"use client";
import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  published:    { bg: "rgba(74,222,128,0.1)",  color: "#4ade80", label: "Published" },
  generating:   { bg: "rgba(251,191,36,0.1)",  color: "#fbbf24", label: "Generating…" },
  transcribing: { bg: "rgba(96,165,250,0.1)",  color: "#60a5fa", label: "Transcribing…" },
  pending:      { bg: "rgba(148,163,184,0.1)", color: "#94a3b8", label: "Pending" },
  error:        { bg: "rgba(248,113,113,0.1)", color: "#f87171", label: "Error" },
  draft:        { bg: "rgba(148,163,184,0.1)", color: "#94a3b8", label: "Draft" },
};

function ProgressBar({ status }: { status: string }) {
  const animated = ["pending", "transcribing", "generating"].includes(status);
  return (
    <div style={{ background: "var(--border)", borderRadius: 99, height: 4, overflow: "hidden", maxWidth: 240 }}>
      <div style={{
        height: "100%", background: "var(--accent)", borderRadius: 99,
        width: "100%",
        animation: animated ? "indeterminate 1.5s ease-in-out infinite" : "none",
        transformOrigin: "left",
      }} />
    </div>
  );
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending:      "Queued for processing…",
    transcribing: "Transcribing audio with Whisper AI…",
    generating:   "Claude is generating the manual…",
    published:    "Published",
    error:        "Generation failed — try re-uploading",
  };
  return (
    <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 3 }}>
      {labels[status] ?? status}
    </div>
  );
}

interface Manual {
  id:             string;
  tenantId:       string;
  title:          string;
  slug:           string;
  status:         string;
  language:       string | null;
  sourceType:     string | null;
  sourceFileName: string | null;
  videoUrl:       string | null;
  videoDuration:  number | null;
  tenantSlug:     string;
  profileIds:     string[];
  ragIndexed:     boolean;
  ragChunks:      number;
  createdAt:      string;
}

export default function ManualesPage() {
  const { t }         = useTranslation();
  const qc            = useQueryClient();
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab]               = useState<"docs" | "videos">("docs");
  const [uploading, setUploading]   = useState(false);
  const [toast, setToast]           = useState<{ msg: string; ok?: boolean } | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState<"doc" | "video">("doc");
  const [uploadTitle, setUploadTitle]       = useState("");
  const [uploadLanguage, setUploadLanguage] = useState("auto");

  const showToast = (msg: string, ok = false) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 5000);
  };

  const { data, isLoading } = useQuery<{ data: Manual[] }>({
    queryKey: ["manuals"],
    queryFn:  () => api.get("/manuals").then(r => r.data),
    refetchInterval: 10000,
  });

  const allManuals   = data?.data ?? [];
  const docManuals   = allManuals.filter(m => m.sourceType !== "video");
  const videoManuals = allManuals.filter(m => m.sourceType === "video");

  const handleDocUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return showToast("Please select a PDF or DOCX file");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", uploadTitle.trim() || file.name.replace(/\.[^/.]+$/, ""));
      fd.append("language", uploadLanguage);
      await api.post("/manuals/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      qc.invalidateQueries({ queryKey: ["manuals"] });
      setShowUpload(false);
      setUploadTitle("");
      setUploadLanguage("auto");
      if (fileInputRef.current) fileInputRef.current.value = "";
      showToast("Document uploaded — manual generation started (1-2 min)", true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleVideoUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = videoInputRef.current?.files?.[0];
    if (!file) return showToast("Please select a video file");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", uploadTitle.trim() || file.name.replace(/\.[^/.]+$/, ""));
      fd.append("language", uploadLanguage);
      await api.post("/manuals/upload-video", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      qc.invalidateQueries({ queryKey: ["manuals"] });
      setShowUpload(false);
      setUploadTitle("");
      setUploadLanguage("auto");
      if (videoInputRef.current) videoInputRef.current.value = "";
      showToast("Video uploaded — transcription started (2-3 min)", true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || "Upload failed — video may be too large (max 24MB for transcription)");
    } finally {
      setUploading(false);
    }
  };

  const [editingProfiles, setEditingProfiles] = useState<string | null>(null);
  const [profileSelection, setProfileSelection] = useState<string[]>([]);

  const { data: profilesData } = useQuery({
    queryKey: ["profiles"],
    queryFn:  () => api.get("/profiles?limit=100").then(r => r.data),
  });
  interface Profile { id: string; name: string; tenantId: string }
  const allProfiles: Profile[] = profilesData?.data ?? [];

  const handleEditProfiles = (m: Manual) => {
    setProfileSelection(m.profileIds ?? []);
    setEditingProfiles(m.id);
  };

  const handleSaveProfiles = async (manualId: string) => {
    if (profileSelection.length === 0) return showToast("Select at least one profile");
    try {
      await api.patch(`/manuals/${manualId}/profile-assignment`, { profileIds: profileSelection });
      qc.invalidateQueries({ queryKey: ["manuals"] });
      setEditingProfiles(null);
      showToast("Profile assignment saved", true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || "Save failed");
    }
  };

  const handleToggleIndex = async (m: Manual) => {
    try {
      if (m.ragIndexed) {
        await api.delete(`/manuals/${m.id}/index`);
        showToast("Removed from RAG index", true);
      } else {
        const res = await api.post(`/manuals/${m.id}/index`);
        showToast(`Indexed ${(res.data as { chunks: number }).chunks} sections into RAG`, true);
      }
      qc.invalidateQueries({ queryKey: ["manuals"] });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || "Index operation failed");
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/manuals/${id}`);
      qc.invalidateQueries({ queryKey: ["manuals"] });
      showToast("Manual deleted", true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || "Delete failed");
    }
  };

  const card: React.CSSProperties = {
    background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem",
  };

  const ManualCard = ({ m }: { m: Manual }) => {
    const st = STATUS_STYLE[m.status] ?? STATUS_STYLE.draft;
    const isProcessing = ["pending", "transcribing", "generating"].includes(m.status);
    return (
      <div style={card}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem" }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8, flexShrink: 0,
            background: m.sourceType === "video" ? "rgba(96,165,250,0.15)" : "rgba(99,102,241,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.125rem",
          }}>
            {m.sourceType === "video" ? "🎬" : "📄"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
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
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {m.sourceFileName && `Source: ${m.sourceFileName} · `}
              {m.videoDuration && m.videoDuration > 0 ? `${Math.round(m.videoDuration / 60)}min video · ` : ""}
              {new Date(m.createdAt).toLocaleDateString()}
            </div>
            {isProcessing && (
              <div style={{ marginTop: "0.625rem" }}>
                <ProgressBar status={m.status} />
                <StatusLabel status={m.status} />
              </div>
            )}
            {m.status === "published" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                <code style={{ fontSize: "0.6875rem", background: "var(--bg-main)", padding: "2px 8px", borderRadius: 4, color: "var(--text-muted)" }}>
                  /m/{m.tenantSlug}/{m.slug}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/m/${m.tenantSlug}/${m.slug}`).then(() => showToast("Link copied!", true))}
                  style={{ fontSize: "0.6875rem", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}
                >
                  Copy link
                </button>
                <a href={`/m/${m.tenantSlug}/${m.slug}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: "0.6875rem", padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.08)", color: "var(--accent)", textDecoration: "none" }}>
                  Preview →
                </a>
              </div>
            )}
            {m.status === "error" && (
              <p style={{ fontSize: "0.75rem", color: "#f87171", marginTop: "0.375rem" }}>
                Generation failed — try re-uploading the file.
              </p>
            )}
            {m.status === "published" && (
              <>
                {/* Profile chips */}
                {allProfiles.length > 0 && (
                  <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.5rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Profiles:</span>
                    {allProfiles.filter((p) => p.tenantId === m.tenantId).map((p) => {
                      const assigned = (m.profileIds ?? []).includes(p.id);
                      return (
                        <span key={p.id} style={{ fontSize: "0.6875rem", padding: "2px 8px", borderRadius: 99, border: `1px solid ${assigned ? "rgba(99,102,241,0.4)" : "var(--border)"}`, background: assigned ? "rgba(99,102,241,0.1)" : "transparent", color: assigned ? "var(--accent)" : "var(--text-muted)", fontWeight: assigned ? 600 : 400 }}>
                          {assigned && "✓ "}{p.name}
                        </span>
                      );
                    })}
                    <button onClick={() => handleEditProfiles(m)} style={{ fontSize: "0.6875rem", padding: "2px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}>
                      Edit ✎
                    </button>
                  </div>
                )}
                {/* RAG status */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.375rem" }}>
                  <span style={{ fontSize: "0.6875rem", padding: "2px 8px", borderRadius: 99, border: `1px solid ${m.ragIndexed ? "rgba(74,222,128,0.3)" : "rgba(148,163,184,0.3)"}`, background: m.ragIndexed ? "rgba(74,222,128,0.1)" : "transparent", color: m.ragIndexed ? "#4ade80" : "var(--text-muted)", fontWeight: 600 }}>
                    {m.ragIndexed ? `🧠 RAG — ${m.ragChunks} sections` : "🧠 Not indexed"}
                  </span>
                  <button onClick={() => handleToggleIndex(m)} style={{ fontSize: "0.6875rem", padding: "2px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}>
                    {m.ragIndexed ? "Remove" : "Index into RAG"}
                  </button>
                </div>
              </>
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
  };

  return (
    <div style={{ maxWidth: 900 }}>
      {toast && (
        <div style={{
          position: "fixed", top: "1.25rem", right: "1.25rem", zIndex: 100,
          padding: "0.75rem 1.25rem", borderRadius: 8, fontSize: "0.875rem", fontWeight: 500,
          background: toast.ok ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
          border: `1px solid ${toast.ok ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
          color: toast.ok ? "#4ade80" : "#f87171",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)" }}>{t("manuals.title")}</h1>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            {t("manuals.subtitle")}
          </p>
        </div>
        <button
          onClick={() => { setShowUpload(true); setUploadType(tab === "videos" ? "video" : "doc"); }}
          style={{ padding: "0.5rem 1.25rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
        >
          + {tab === "videos" ? "Upload video" : "Create manual"}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.5rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "0.25rem" }}>
        <button onClick={() => setTab("docs")} style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: 8, border: "none", cursor: "pointer", background: tab === "docs" ? "var(--accent)" : "transparent", color: tab === "docs" ? "#fff" : "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 600, transition: "all 0.15s" }}>
          📄 Documents ({docManuals.length})
        </button>
        <button onClick={() => setTab("videos")} style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: 8, border: "none", cursor: "pointer", background: tab === "videos" ? "var(--accent)" : "transparent", color: tab === "videos" ? "#fff" : "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 600, transition: "all 0.15s" }}>
          🎬 Videos ({videoManuals.length})
        </button>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div style={{ ...card, marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "1rem" }}>
            {uploadType === "video" ? "🎬 Upload video to generate SOP" : "📄 Upload document to generate manual"}
          </h2>
          <form onSubmit={uploadType === "video" ? handleVideoUpload : handleDocUpload}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  Title (optional)
                </label>
                <input
                  value={uploadTitle}
                  onChange={e => setUploadTitle(e.target.value)}
                  placeholder={uploadType === "video" ? "e.g. How to Install GPS Tracker" : "e.g. Housekeeping Operations Manual"}
                  style={{ width: "100%", padding: "0.5rem 0.75rem", background: "var(--bg-main)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }}
                />
              </div>
              {/* Language selector */}
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  Output language
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  {([
                    { value: "auto", label: "🔍 Auto-detect" },
                    { value: "en",   label: "🇬🇧 English" },
                    { value: "es",   label: "🇪🇸 Spanish" },
                    { value: "fr",   label: "🇫🇷 French" },
                    { value: "pt",   label: "🇵🇹 Portuguese" },
                    { value: "de",   label: "🇩🇪 German" },
                  ] as const).map(lang => (
                    <div
                      key={lang.value}
                      onClick={() => setUploadLanguage(lang.value)}
                      style={{
                        padding: "0.5rem 0.75rem", borderRadius: 8, cursor: "pointer",
                        border: `1.5px solid ${uploadLanguage === lang.value ? "var(--accent)" : "var(--border)"}`,
                        background: uploadLanguage === lang.value ? "rgba(99,102,241,0.08)" : "transparent",
                        fontSize: "0.8125rem", fontWeight: uploadLanguage === lang.value ? 600 : 400,
                        color: uploadLanguage === lang.value ? "var(--accent)" : "var(--text-secondary)",
                        transition: "all 0.15s",
                      }}
                    >
                      {lang.label}
                    </div>
                  ))}
                </div>
                {uploadLanguage !== "auto" && (
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 5 }}>
                    Claude will generate the entire manual in the selected language, translating the source if needed.
                  </p>
                )}
              </div>

              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  {uploadType === "video"
                    ? "Video file (MP4, MOV, WebM — max 24MB for transcription)"
                    : "PDF or DOCX file"}
                </label>
                {uploadType === "video"
                  ? <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,audio/mpeg,audio/mp4,audio/wav" style={{ fontSize: "0.875rem", color: "var(--text-primary)" }} />
                  : <input ref={fileInputRef} type="file" accept=".pdf,.docx" style={{ fontSize: "0.875rem", color: "var(--text-primary)" }} />
                }
              </div>
              <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 8, padding: "0.75rem" }}>
                {uploadType === "video" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {[
                      "1. Whisper AI transcribes the audio with timestamps",
                      "2. Claude analyzes the procedure and creates structured sections",
                      "3. Each section gets video clip timestamps",
                      "4. Published as a mobile-friendly SOP web manual",
                    ].map(s => (
                      <p key={s} style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>{s}</p>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                    Claude will analyze the document and generate a structured web manual with sections, numbered steps, checklists and notes. Takes 1-2 minutes.
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => { setShowUpload(false); setUploadTitle(""); setUploadLanguage("auto"); }}
                  style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: "0.875rem", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  style={{ padding: "0.5rem 1.25rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.7 : 1 }}
                >
                  {uploading
                    ? (uploadType === "video" ? "Uploading…" : "Uploading…")
                    : (uploadType === "video" ? "Upload & transcribe" : "Generate manual")}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Documents tab */}
      {tab === "docs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
          ) : docManuals.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: "3rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📄</div>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>No document manuals yet</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
                Upload a PDF and Claude will generate a structured web manual for your team
              </p>
              <button onClick={() => { setShowUpload(true); setUploadType("doc"); }} style={{ padding: "0.625rem 1.5rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
                + Create first manual
              </button>
            </div>
          ) : (
            docManuals.map(m => <ManualCard key={m.id} m={m} />)
          )}
        </div>
      )}

      {/* Videos tab */}
      {tab === "videos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, padding: "1rem 1.25rem", display: "flex", gap: "0.875rem" }}>
            <span style={{ fontSize: "1.25rem", flexShrink: 0 }}>🎬</span>
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>Video-to-SOP generation</p>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Upload a training video and Whisper AI transcribes the audio. Claude generates a structured SOP with sections mapped to video timestamps. Best results with clear narration, under 10 minutes.
              </p>
            </div>
          </div>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
          ) : videoManuals.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: "3rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎬</div>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>No video manuals yet</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
                Upload a training video and Claude will generate a structured SOP from the transcription
              </p>
              <button onClick={() => { setShowUpload(true); setUploadType("video"); }} style={{ padding: "0.625rem 1.5rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
                + Upload first video
              </button>
            </div>
          ) : (
            videoManuals.map(m => <ManualCard key={m.id} m={m} />)
          )}
        </div>
      )}

      {editingProfiles && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setEditingProfiles(null)}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.75rem", width: 460, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.375rem" }}>Assign profiles</h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>Select all profiles that should see this manual in their bot context.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
              {allProfiles.map((p) => {
                const on = profileSelection.includes(p.id);
                return (
                  <div key={p.id}
                    onClick={() => setProfileSelection(prev => on ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", border: `1px solid ${on ? "rgba(99,102,241,0.4)" : "var(--border)"}`, borderRadius: 9, cursor: "pointer", background: on ? "rgba(99,102,241,0.06)" : "transparent" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.875rem" }}>👤</div>
                      <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)" }}>{p.name}</span>
                    </div>
                    <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", color: "#fff", fontWeight: 700 }}>
                      {on && "✓"}
                    </div>
                  </div>
                );
              })}
            </div>
            {profileSelection.length === 0 && (
              <p style={{ fontSize: "0.75rem", color: "#f87171", marginBottom: "0.75rem" }}>Select at least one profile</p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button onClick={() => setEditingProfiles(null)} style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: "0.875rem", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => handleSaveProfiles(editingProfiles)} disabled={profileSelection.length === 0} style={{ padding: "0.5rem 1.25rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", opacity: profileSelection.length === 0 ? 0.5 : 1 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes indeterminate {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
