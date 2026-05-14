"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

const SECTION_TYPES = [
  { value: "intro",     label: "intro",     color: "#60a5fa" },
  { value: "steps",     label: "steps",     color: "#818cf8" },
  { value: "checklist", label: "checklist", color: "#34d399" },
  { value: "note",      label: "note",      color: "#fbbf24" },
  { value: "warning",   label: "warning",   color: "#f87171" },
  { value: "content",   label: "content",   color: "#8b90aa" },
];

interface Section {
  id:          string;
  orderIndex:  number;
  title:       string;
  contentHtml: string;
  sectionType: string;
  images:      unknown[];
}

function buildHtml(
  _type: string,
  content: string,
  steps: string[],
  checklist: string[],
  notes: string[],
  warning: string,
): string {
  let html = `<p class="sb-section-body">${content}</p>`;
  if (warning) {
    html =
      `<div class="sb-warning"><span class="sb-warning-icon">⚠</span><div><strong>Safety Warning</strong><p>${warning}</p></div></div>` +
      html;
  }
  if (steps.filter(Boolean).length) {
    html += `<ol class="sb-steps">${steps
      .filter(Boolean)
      .map(
        (s, i) =>
          `<li class="sb-step"><span class="sb-step-num">${i + 1}</span><span class="sb-step-text">${s}</span></li>`,
      )
      .join("")}</ol>`;
  }
  if (checklist.filter(Boolean).length) {
    html += `<ul class="sb-checklist">${checklist
      .filter(Boolean)
      .map(
        (s) =>
          `<li class="sb-check"><span class="sb-check-box"></span><span style="color:#1a1a1a">${s}</span></li>`,
      )
      .join("")}</ul>`;
  }
  if (notes.filter(Boolean).length) {
    html += notes
      .filter(Boolean)
      .map((n) => `<div class="sb-note"><span class="sb-note-label">Note</span><p>${n}</p></div>`)
      .join("");
  }
  return html;
}

function parseSteps(html: string): string[] {
  const matches = html.match(/class="sb-step-text">([^<]+)<\/span><\/li>/g) ?? [];
  return matches.map((m) =>
    m.replace(/class="sb-step-text">/, "").replace(/<\/span><\/li>/, ""),
  );
}

function parseChecklist(html: string): string[] {
  const matches = html.match(/style="color:#1a1a1a">([^<]+)<\/span><\/li>/g) ?? [];
  return matches.map((m) =>
    m.replace(/style="color:#1a1a1a">/, "").replace(/<\/span><\/li>/, ""),
  );
}

function parseNotes(html: string): string[] {
  const matches = html.match(/<p>([^<]+)<\/p><\/div>/g) ?? [];
  return matches.map((m) => m.replace(/<p>/, "").replace(/<\/p><\/div>/, ""));
}

function parseWarning(html: string): string {
  const m = html.match(/<strong>Safety Warning<\/strong><p>([^<]+)<\/p>/);
  return m ? m[1] : "";
}

function parseContent(html: string): string {
  const m = html.match(/<p class="sb-section-body">([^<]+)<\/p>/);
  return m
    ? m[1]
    : html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
}

export default function ManualEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sType, setSType] = useState("content");
  const [steps, setSteps] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [warning, setWarning] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok?: boolean } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(false);

  const showToast = (msg: string, ok = false) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const { data: manual, isLoading } = useQuery({
    queryKey: ["manual-edit", id],
    queryFn: () => api.get(`/manuals/${id}`).then((r) => r.data),
  });

  const sections: Section[] = (manual?.sections ?? []).sort(
    (a: Section, b: Section) => a.orderIndex - b.orderIndex,
  );

  const loadSection = useCallback((sec: Section) => {
    setActiveSectionId(sec.id);
    setTitle(sec.title);
    setSType(sec.sectionType ?? "content");
    setContent(parseContent(sec.contentHtml));
    setSteps(parseSteps(sec.contentHtml));
    setChecklist(parseChecklist(sec.contentHtml));
    setNotes(parseNotes(sec.contentHtml));
    setWarning(parseWarning(sec.contentHtml));
    setUnsaved(false);
  }, []);

  useEffect(() => {
    if (sections.length > 0 && !activeSectionId) {
      loadSection(sections[0]);
    }
  }, [sections.length, activeSectionId, loadSection]);

  const activeSection = sections.find((s) => s.id === activeSectionId);

  const handleSave = useCallback(async () => {
    if (!activeSectionId) return;
    setSaving(true);
    try {
      const contentHtml = buildHtml(sType, content, steps, checklist, notes, warning);
      await api.put(`/manuals/${id}/sections/${activeSectionId}`, {
        title,
        contentHtml,
        sectionType: sType,
      });
      qc.invalidateQueries({ queryKey: ["manual-edit", id] });
      setUnsaved(false);
      showToast(t("toast.sectionSaved"), true);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || t("toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [activeSectionId, id, sType, content, steps, checklist, notes, warning, title, qc]);

  const handleRegenerate = async () => {
    if (!activeSectionId || !aiPrompt.trim()) return;
    setRegenerating(true);
    try {
      const res = await api.post(
        `/manuals/${id}/sections/${activeSectionId}/regenerate`,
        { instruction: aiPrompt },
      );
      const { generatedContent } = res.data;
      setTitle(generatedContent.title ?? title);
      setSType(generatedContent.type ?? sType);
      setContent(generatedContent.content ?? content);
      setSteps(generatedContent.steps ?? []);
      setChecklist(generatedContent.checklist ?? []);
      setNotes(generatedContent.notes ?? []);
      setWarning(generatedContent.warning ?? "");
      setAiPrompt("");
      qc.invalidateQueries({ queryKey: ["manual-edit", id] });
      showToast(t("toast.sectionRegenerated"), true);
      setUnsaved(true);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || t("toast.saveFailed"));
    } finally {
      setRegenerating(false);
    }
  };

  const handleAddSection = async () => {
    if (!newSectionTitle.trim()) return;
    try {
      const insertAfterIndex = activeSection?.orderIndex ?? sections.length - 1;
      const res = await api.post(`/manuals/${id}/sections`, {
        title: newSectionTitle,
        insertAfterIndex,
      });
      qc.invalidateQueries({ queryKey: ["manual-edit", id] });
      setShowAddModal(false);
      setNewSectionTitle("");
      showToast(t("toast.sectionSaved"), true);
      setTimeout(() => loadSection(res.data), 300);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || t("toast.saveFailed"));
    }
  };

  const handleDeleteSection = async () => {
    if (!confirmDeleteId) return;
    try {
      await api.delete(`/manuals/${id}/sections/${confirmDeleteId}`);
      qc.invalidateQueries({ queryKey: ["manual-edit", id] });
      setConfirmDeleteId(null);
      setActiveSectionId(null);
      showToast(t("toast.sectionDeleted"), true);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || t("toast.deleteFailed"));
    }
  };

  const handleMoveSection = async (sectionId: string, direction: "up" | "down") => {
    const sorted = [...sections];
    const idx = sorted.findIndex((s) => s.id === sectionId);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === sorted.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    try {
      await api.patch(`/manuals/${id}/sections/reorder`, {
        sectionIds: sorted.map((s) => s.id),
      });
      qc.invalidateQueries({ queryKey: ["manual-edit", id] });
    } catch {
      showToast(t("toast.saveFailed"));
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--bg-main)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontFamily: "inherit",
    fontSize: "0.875rem",
    padding: "0.5rem 0.75rem",
    outline: "none",
    boxSizing: "border-box",
  };

  if (isLoading)
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <div
          style={{
            width: 24,
            height: 24,
            border: "2px solid var(--accent)",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr 280px",
        height: "calc(100vh - 60px)",
        overflow: "hidden",
        margin: "-32px -40px",
        background: "var(--bg-main)",
      }}
    >
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "1.25rem",
            right: "1.25rem",
            zIndex: 200,
            padding: "0.75rem 1.25rem",
            borderRadius: 8,
            fontSize: "0.875rem",
            fontWeight: 600,
            background: toast.ok ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
            border: `1px solid ${toast.ok ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
            color: toast.ok ? "#4ade80" : "#f87171",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Add section modal */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "1.5rem",
              width: 400,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: "1rem",
              }}
            >
              Add new section
            </h3>
            <input
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              placeholder="Section title…"
              style={inputStyle}
              onKeyDown={(e) => e.key === "Enter" && handleAddSection()}
              autoFocus
            />
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                marginTop: "0.5rem",
              }}
            >
              Will be inserted after the current section.
            </p>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                marginTop: "1.25rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  padding: "0.5rem 1rem",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddSection}
                style={{
                  padding: "0.5rem 1.25rem",
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Add section
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDeleteId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 14,
              padding: "1.5rem",
              width: 380,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>⚠</div>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: "0.5rem",
              }}
            >
              Delete section?
            </h3>
            <p
              style={{
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
                marginBottom: "1.25rem",
                lineHeight: 1.5,
              }}
            >
              This section will be permanently removed and de-indexed from RAG.
            </p>
            <div style={{ display: "flex", gap: "0.625rem", justifyContent: "center" }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{
                  padding: "0.5rem 1rem",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSection}
                style={{
                  padding: "0.5rem 1.25rem",
                  background: "rgba(248,113,113,0.15)",
                  border: "1px solid rgba(248,113,113,0.4)",
                  borderRadius: 8,
                  color: "#f87171",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT — Section list */}
      <div
        style={{
          background: "var(--bg-card)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "1rem", borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => router.push("/dashboard/manuales")}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.75rem",
              padding: 0,
              marginBottom: "0.5rem",
            }}
          >
            ← Back
          </button>
          <div
            style={{
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1.3,
            }}
          >
            {manual?.title}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 2 }}>
            {sections.length} sections · {manual?.language?.toUpperCase()} · {manual?.status}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
          {sections.map((sec, idx) => (
            <div
              key={sec.id}
              onClick={() => {
                if (unsaved && !confirm("Discard unsaved changes?")) return;
                loadSection(sec);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 0.75rem",
                borderRadius: 8,
                cursor: "pointer",
                border: `1px solid ${activeSectionId === sec.id ? "rgba(99,102,241,0.25)" : "transparent"}`,
                background:
                  activeSectionId === sec.id ? "rgba(99,102,241,0.08)" : "transparent",
                marginBottom: 2,
                transition: "all 0.12s",
              }}
            >
              {/* Reorder arrows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveSection(sec.id, "up");
                  }}
                  disabled={idx === 0}
                  style={{
                    width: 16,
                    height: 14,
                    border: "none",
                    background: "transparent",
                    color: idx === 0 ? "var(--text-muted)" : "var(--text-secondary)",
                    cursor: idx === 0 ? "default" : "pointer",
                    fontSize: 9,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ▲
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveSection(sec.id, "down");
                  }}
                  disabled={idx === sections.length - 1}
                  style={{
                    width: 16,
                    height: 14,
                    border: "none",
                    background: "transparent",
                    color:
                      idx === sections.length - 1 ? "var(--text-muted)" : "var(--text-secondary)",
                    cursor: idx === sections.length - 1 ? "default" : "pointer",
                    fontSize: 9,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ▼
                </button>
              </div>

              {/* Section number */}
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  background: activeSectionId === sec.id ? "var(--accent)" : "var(--bg-main)",
                  color: activeSectionId === sec.id ? "#fff" : "var(--text-muted)",
                  fontSize: 9,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontFamily: "monospace",
                }}
              >
                {idx + 1}
              </div>

              {/* Title */}
              <div
                style={{
                  flex: 1,
                  fontSize: "0.75rem",
                  color: activeSectionId === sec.id ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: activeSectionId === sec.id ? 600 : 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {sec.title}
              </div>

              {/* Image badge */}
              {sec.images?.length > 0 && (
                <span style={{ fontSize: 9, color: "var(--green)", flexShrink: 0 }}>🖼</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: "0.5rem" }}>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              width: "100%",
              padding: "0.625rem",
              border: "1px dashed var(--border)",
              borderRadius: 8,
              background: "transparent",
              color: "var(--text-muted)",
              fontSize: "0.75rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.375rem",
            }}
          >
            <span style={{ fontSize: "1rem" }}>+</span> Add section
          </button>
        </div>
      </div>

      {/* CENTER — Editor */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-main)",
        }}
      >
        {/* Topbar */}
        <div
          style={{
            padding: "0.75rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg-card)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>{manual?.title}</span>
            <span>›</span>
            <span style={{ color: "var(--text-primary)" }}>
              {activeSection?.title ?? "Select a section"}
            </span>
            {unsaved && (
              <span style={{ color: "#fbbf24", fontSize: "0.6875rem" }}>● unsaved</span>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            {activeSectionId && (
              <button
                onClick={() => setConfirmDeleteId(activeSectionId)}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: 7,
                  border: "1px solid rgba(248,113,113,0.3)",
                  background: "transparent",
                  color: "#f87171",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                Delete section
              </button>
            )}
            <button
              onClick={() => {
                if (activeSection) loadSection(activeSection);
                setUnsaved(false);
              }}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: 7,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !activeSectionId}
              style={{
                padding: "0.35rem 0.875rem",
                borderRadius: 7,
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? t("btn.saving") : `${t("btn.save")} ⌘S`}
            </button>
          </div>
        </div>

        {/* Editor body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem" }}>
          {!activeSectionId ? (
            <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-muted)" }}>
              <p style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>←</p>
              <p>Select a section to edit</p>
            </div>
          ) : (
            <>
              {/* Section type */}
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Section type
                </div>
                <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                  {SECTION_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => {
                        setSType(t.value);
                        setUnsaved(true);
                      }}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 99,
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "monospace",
                        border: `1px solid ${sType === t.value ? t.color : "var(--border)"}`,
                        background: sType === t.value ? `${t.color}18` : "transparent",
                        color: sType === t.value ? t.color : "var(--text-muted)",
                        transition: "all 0.12s",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Title
                </div>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setUnsaved(true);
                  }}
                  style={{ ...inputStyle, fontSize: "1rem", fontWeight: 700 }}
                />
              </div>

              {/* Content */}
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Description
                </div>
                <textarea
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setUnsaved(true);
                  }}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              {/* Warning */}
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Safety warning{" "}
                  <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span>
                </div>
                <input
                  value={warning}
                  onChange={(e) => {
                    setWarning(e.target.value);
                    setUnsaved(true);
                  }}
                  placeholder="Leave empty if no warning needed"
                  style={inputStyle}
                />
              </div>

              {/* Steps */}
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Steps{" "}
                  <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                    (numbered procedure)
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  {steps.map((step, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: "var(--accent)",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontFamily: "monospace",
                        }}
                      >
                        {i + 1}
                      </div>
                      <input
                        value={step}
                        onChange={(e) => {
                          const ns = [...steps];
                          ns[i] = e.target.value;
                          setSteps(ns);
                          setUnsaved(true);
                        }}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={() => {
                          setSteps(steps.filter((_, si) => si !== i));
                          setUnsaved(true);
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          border: "none",
                          background: "transparent",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "1rem",
                          borderRadius: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      setSteps([...steps, ""]);
                      setUnsaved(true);
                    }}
                    style={{
                      padding: "0.5rem",
                      border: "1px dashed var(--border)",
                      borderRadius: 8,
                      background: "transparent",
                      color: "var(--text-muted)",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    + Add step
                  </button>
                </div>
              </div>

              {/* Checklist */}
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Checklist{" "}
                  <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                    (items to verify)
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  {checklist.map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          border: "2px solid var(--accent)",
                          borderRadius: 4,
                          flexShrink: 0,
                        }}
                      />
                      <input
                        value={item}
                        onChange={(e) => {
                          const nc = [...checklist];
                          nc[i] = e.target.value;
                          setChecklist(nc);
                          setUnsaved(true);
                        }}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={() => {
                          setChecklist(checklist.filter((_, ci) => ci !== i));
                          setUnsaved(true);
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          border: "none",
                          background: "transparent",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "1rem",
                          borderRadius: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      setChecklist([...checklist, ""]);
                      setUnsaved(true);
                    }}
                    style={{
                      padding: "0.5rem",
                      border: "1px dashed var(--border)",
                      borderRadius: 8,
                      background: "transparent",
                      color: "var(--text-muted)",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    + Add item
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: "1.5rem" }}>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Notes{" "}
                  <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                    (tips and reminders)
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  {notes.map((note, i) => (
                    <div
                      key={i}
                      style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}
                    >
                      <div
                        style={{
                          width: 3,
                          height: 36,
                          background: "#fbbf24",
                          borderRadius: 2,
                          flexShrink: 0,
                          marginTop: 4,
                        }}
                      />
                      <input
                        value={note}
                        onChange={(e) => {
                          const nn = [...notes];
                          nn[i] = e.target.value;
                          setNotes(nn);
                          setUnsaved(true);
                        }}
                        style={{
                          ...inputStyle,
                          flex: 1,
                          background: "rgba(251,191,36,0.05)",
                          borderColor: "rgba(251,191,36,0.2)",
                        }}
                      />
                      <button
                        onClick={() => {
                          setNotes(notes.filter((_, ni) => ni !== i));
                          setUnsaved(true);
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          border: "none",
                          background: "transparent",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "1rem",
                          borderRadius: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginTop: 4,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      setNotes([...notes, ""]);
                      setUnsaved(true);
                    }}
                    style={{
                      padding: "0.5rem",
                      border: "1px dashed rgba(251,191,36,0.25)",
                      borderRadius: 8,
                      background: "transparent",
                      color: "var(--text-muted)",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    + Add note
                  </button>
                </div>
              </div>

              {/* AI Regenerate */}
              <div
                style={{
                  background: "rgba(99,102,241,0.05)",
                  border: "1px solid rgba(99,102,241,0.2)",
                  borderRadius: 10,
                  padding: "1rem 1.25rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.625rem",
                  }}
                >
                  <span style={{ fontSize: "0.875rem" }}>✦</span>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      color: "var(--accent2)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Regenerate with AI
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginBottom: "0.75rem",
                    lineHeight: 1.5,
                  }}
                >
                  Describe what to change. Claude rewrites the section keeping the same structure.
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder='e.g. "Make it shorter", "Add safety steps", "Translate to French"…'
                    onKeyDown={(e) => e.key === "Enter" && handleRegenerate()}
                    style={{
                      ...inputStyle,
                      flex: 1,
                      background: "var(--bg-main)",
                      borderColor: "rgba(99,102,241,0.25)",
                    }}
                  />
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating || !aiPrompt.trim()}
                    style={{
                      padding: "0.5rem 1rem",
                      background:
                        "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(129,140,248,0.2))",
                      border: "1px solid rgba(99,102,241,0.35)",
                      borderRadius: 8,
                      color: "var(--accent2)",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      cursor: regenerating || !aiPrompt.trim() ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                      opacity: regenerating || !aiPrompt.trim() ? 0.6 : 1,
                    }}
                  >
                    {regenerating ? "✦ Working…" : "✦ Regenerate"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* RIGHT — Live mobile preview */}
      <div
        style={{
          background: "var(--bg-card)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Mobile preview
          </span>
          <span style={{ fontSize: "0.6875rem", color: "#4ade80" }}>● Live</span>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Mobile frame */}
          <div
            style={{
              background: "#1a1a2e",
              borderRadius: 28,
              padding: 10,
              width: 220,
              flexShrink: 0,
            }}
          >
            <div
              style={{ background: "#fff", borderRadius: 20, overflow: "hidden", minHeight: 380 }}
            >
              {/* Manual header */}
              <div style={{ background: "#185FA5", padding: "12px 14px 10px" }}>
                <div
                  style={{
                    fontSize: 8,
                    color: "rgba(255,255,255,0.6)",
                    marginBottom: 1,
                    fontFamily: "monospace",
                  }}
                >
                  {manual?.title?.toUpperCase()?.slice(0, 20)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>
                  {manual?.title?.slice(0, 24)}
                </div>
              </div>

              {/* Section tabs */}
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  overflow: "hidden",
                  padding: "5px 8px",
                  borderBottom: "1px solid #eee",
                }}
              >
                {sections.slice(0, 4).map((s, i) => (
                  <div
                    key={s.id}
                    style={{
                      fontSize: 8,
                      padding: "2px 7px",
                      borderRadius: 99,
                      whiteSpace: "nowrap",
                      border: `1px solid ${s.id === activeSectionId ? "#B5D4F4" : "#ddd"}`,
                      color: s.id === activeSectionId ? "#0C447C" : "#666",
                      background: s.id === activeSectionId ? "#E6F1FB" : "#f5f5f5",
                      fontWeight: s.id === activeSectionId ? 600 : 400,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}. {s.title.slice(0, 8)}
                  </div>
                ))}
              </div>

              {/* Section content */}
              <div style={{ padding: "10px 12px" }}>
                <div
                  style={{
                    fontSize: 8,
                    color: "#378ADD",
                    fontWeight: 700,
                    marginBottom: 3,
                    fontFamily: "monospace",
                  }}
                >
                  SECTION {(activeSection?.orderIndex ?? 0) + 1} OF {sections.length}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#1a1a1a",
                    marginBottom: 6,
                    lineHeight: 1.3,
                  }}
                >
                  {title}
                </div>
                <div
                  style={{ fontSize: 10, color: "#444", lineHeight: 1.6, marginBottom: 8 }}
                >
                  {content.slice(0, 120)}
                  {content.length > 120 ? "…" : ""}
                </div>

                {warning && (
                  <div
                    style={{
                      background: "#FFF0F0",
                      borderLeft: "3px solid #E53E3E",
                      padding: "6px 8px",
                      borderRadius: "0 5px 5px 0",
                      marginBottom: 6,
                      fontSize: 9,
                      color: "#742A2A",
                    }}
                  >
                    ⚠ {warning.slice(0, 60)}
                  </div>
                )}

                {steps
                  .filter(Boolean)
                  .slice(0, 4)
                  .map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 6,
                        marginBottom: 4,
                        alignItems: "flex-start",
                      }}
                    >
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "#185FA5",
                          color: "#fff",
                          fontSize: 8,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        {i + 1}
                      </div>
                      <div style={{ fontSize: 10, color: "#1a1a1a", lineHeight: 1.4 }}>
                        {s.slice(0, 50)}
                        {s.length > 50 ? "…" : ""}
                      </div>
                    </div>
                  ))}

                {checklist
                  .filter(Boolean)
                  .slice(0, 3)
                  .map((item, i) => (
                    <div
                      key={i}
                      style={{ display: "flex", gap: 6, marginBottom: 3, alignItems: "center" }}
                    >
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          border: "1.5px solid #185FA5",
                          borderRadius: 3,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ fontSize: 10, color: "#1a1a1a" }}>{item.slice(0, 50)}</div>
                    </div>
                  ))}

                {notes
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((note, i) => (
                    <div
                      key={i}
                      style={{
                        background: "#FFF8E7",
                        borderLeft: "2px solid #EF9F27",
                        padding: "4px 6px",
                        borderRadius: "0 4px 4px 0",
                        marginBottom: 4,
                        fontSize: 9,
                        color: "#633806",
                      }}
                    >
                      {note.slice(0, 70)}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Shortcuts */}
          <div
            style={{
              marginTop: "1rem",
              width: "100%",
              padding: "0.75rem",
              background: "var(--bg-main)",
              borderRadius: 8,
            }}
          >
            <div
              style={{
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "0.5rem",
              }}
            >
              Shortcuts
            </div>
            {(
              [
                ["Save", "⌘S"],
                ["Add step", "click +"],
                ["Regenerate", "Enter in AI box"],
              ] as [string, string][]
            ).map(([label, key]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.6875rem",
                  color: "var(--text-muted)",
                  marginBottom: "0.25rem",
                }}
              >
                <span>{label}</span>
                <code
                  style={{
                    background: "var(--bg-card)",
                    padding: "1px 5px",
                    borderRadius: 3,
                    fontSize: "0.625rem",
                    fontFamily: "monospace",
                  }}
                >
                  {key}
                </code>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
