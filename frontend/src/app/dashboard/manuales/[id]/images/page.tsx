"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

interface SectionImage {
  url:   string;
  index: number;
  page?: number | null;
}

interface Section {
  id:         string;
  title:      string;
  orderIndex: number;
  images:     SectionImage[];
}

export default function ManualImageEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc     = useQueryClient();

  const [toast, setToast]         = useState<{ msg: string; ok?: boolean } | null>(null);
  const [saving, setSaving]       = useState(false);
  const [preview, setPreview]     = useState<string | null>(null);
  const [movingImg, setMovingImg] = useState<{ image: SectionImage; fromSectionId: string } | null>(null);

  const showToast = (msg: string, ok = false) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const { data: manual, isLoading } = useQuery({
    queryKey: ["manual-detail", id],
    queryFn:  () => api.get(`/manuals/${id}`).then(r => r.data),
  });

  const { data: availableData } = useQuery({
    queryKey: ["manual-available-images", id],
    queryFn:  () => api.get(`/manuals/${id}/available-images`).then(r => r.data),
  });

  const sections: Section[]          = manual?.sections ?? [];
  const allAvailable: SectionImage[] = availableData?.images ?? [];
  const assignedIndices              = new Set(sections.flatMap(s => s.images.map(img => img.index)));
  const unassigned                   = allAvailable.filter(img => !assignedIndices.has(img.index));

  const handleRemoveImage = async (sectionId: string, imageIndex: number) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    const newImages = section.images.filter(img => img.index !== imageIndex);
    setSaving(true);
    try {
      await api.patch(`/manuals/${id}/sections/${sectionId}/images`, { images: newImages });
      qc.invalidateQueries({ queryKey: ["manual-detail", id] });
      showToast("Image removed", true);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err.response?.data?.error || "Remove failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAddImage = async (sectionId: string, image: SectionImage) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    if (section.images.length >= 3) return showToast("Max 3 images per section");
    if (section.images.some(img => img.index === image.index)) return showToast("Already in this section");
    const newImages = [...section.images, image];
    setSaving(true);
    try {
      await api.patch(`/manuals/${id}/sections/${sectionId}/images`, { images: newImages });
      qc.invalidateQueries({ queryKey: ["manual-detail", id] });
      showToast("Image added", true);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err.response?.data?.error || "Add failed");
    } finally {
      setSaving(false);
    }
  };

  const handleMoveImage = async (targetSectionId: string) => {
    if (!movingImg) return;
    setSaving(true);
    try {
      await api.post(`/manuals/${id}/sections/${movingImg.fromSectionId}/move-image`, {
        imageIndex:      movingImg.image.index,
        targetSectionId,
      });
      qc.invalidateQueries({ queryKey: ["manual-detail", id] });
      setMovingImg(null);
      showToast("Image moved", true);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err.response?.data?.error || "Move failed");
    } finally {
      setSaving(false);
    }
  };

  const card: React.CSSProperties = {
    background:   "var(--bg-card)",
    border:       "1px solid var(--border)",
    borderRadius: 12,
    padding:      "1rem 1.25rem",
    marginBottom: "0.75rem",
  };

  if (isLoading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
      <div style={{ width: 24, height: 24, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: "1.25rem", right: "1.25rem", zIndex: 100, padding: "0.75rem 1.25rem", borderRadius: 8, fontSize: "0.875rem", fontWeight: 500, background: toast.ok ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)", border: `1px solid ${toast.ok ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`, color: toast.ok ? "#4ade80" : "#f87171" }}>
          {toast.msg}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setPreview(null)}>
          <img src={preview} style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8, objectFit: "contain" }} alt="preview" />
        </div>
      )}

      {/* Move modal */}
      {movingImg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setMovingImg(null)}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.5rem", width: 420, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>Move image to section</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "1rem" }}>Select the destination section</p>
            <img src={movingImg.image.url} style={{ width: "100%", height: 120, objectFit: "contain", borderRadius: 8, background: "var(--bg-main)", marginBottom: "1rem" }} alt="moving" />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", maxHeight: 300, overflowY: "auto" }}>
              {sections.filter(s => s.id !== movingImg.fromSectionId).map(s => (
                <button key={s.id} onClick={() => handleMoveImage(s.id)} disabled={s.images.length >= 3 || saving}
                  style={{ padding: "0.625rem 1rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: s.images.length >= 3 ? "var(--text-muted)" : "var(--text-primary)", fontSize: "0.875rem", cursor: s.images.length >= 3 ? "not-allowed" : "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>[{s.orderIndex + 1}] {s.title}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{s.images.length}/3</span>
                </button>
              ))}
            </div>
            <button onClick={() => setMovingImg(null)} style={{ marginTop: "1rem", width: "100%", padding: "0.5rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: "0.875rem", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.875rem", padding: 0, marginBottom: "0.75rem" }}>
        ← Back to Manuales
      </button>

      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)" }}>Image Editor</h1>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
          {manual?.title} · {allAvailable.length} total images · {sections.length} sections
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1.25rem", alignItems: "start" }}>

        {/* Left: sections */}
        <div>
          <h2 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
            Sections ({sections.length})
          </h2>

          {sections.map(section => (
            <div key={section.id} style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div>
                  <span style={{ fontSize: "0.6875rem", color: "var(--accent)", fontWeight: 600 }}>Section {section.orderIndex + 1}</span>
                  <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>{section.title}</h3>
                </div>
                <span style={{ fontSize: "0.75rem", color: section.images.length === 3 ? "#fbbf24" : "var(--text-muted)" }}>
                  {section.images.length}/3
                </span>
              </div>

              {/* Assigned images */}
              {section.images.length > 0 ? (
                <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                  {section.images.map((img, i) => (
                    <div key={i} style={{ position: "relative", width: 100, flexShrink: 0 }}>
                      <img
                        src={img.url}
                        onClick={() => setPreview(img.url)}
                        style={{ width: 100, height: 75, objectFit: "cover", borderRadius: 7, border: "1px solid var(--border)", cursor: "pointer" }}
                        onError={e => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
                        alt={`section-img-${i}`}
                      />
                      {img.page && (
                        <div style={{ position: "absolute", bottom: 2, left: 2, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 9, padding: "1px 4px", borderRadius: 3 }}>
                          p.{img.page}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 2, marginTop: 3 }}>
                        <button onClick={() => setMovingImg({ image: img, fromSectionId: section.id })} style={{ flex: 1, padding: "2px", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-muted)", fontSize: 10, cursor: "pointer" }}>→ Move</button>
                        <button onClick={() => handleRemoveImage(section.id, img.index)} disabled={saving} style={{ flex: 1, padding: "2px", background: "transparent", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 4, color: "#f87171", fontSize: 10, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "0.75rem", background: "var(--bg-main)", borderRadius: 8, textAlign: "center", marginBottom: "0.75rem" }}>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>No images assigned</p>
                </div>
              )}

              {/* Add from unassigned pool */}
              {section.images.length < 3 && unassigned.length > 0 && (
                <div>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.375rem" }}>Add image:</p>
                  <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                    {unassigned.slice(0, 8).map(img => (
                      <div key={img.index} style={{ position: "relative" }}>
                        <img
                          src={img.url}
                          onClick={() => setPreview(img.url)}
                          style={{ width: 60, height: 45, objectFit: "cover", borderRadius: 5, border: "1px solid var(--border)", cursor: "pointer", opacity: 0.7 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                          alt={`pool-${img.index}`}
                        />
                        <button
                          onClick={() => handleAddImage(section.id, img)}
                          disabled={saving}
                          style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "var(--accent)", border: "none", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                        >+</button>
                        {img.page && (
                          <div style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "center", marginTop: 1 }}>p.{img.page}</div>
                        )}
                      </div>
                    ))}
                    {unassigned.length > 8 && (
                      <div style={{ width: 60, height: 45, borderRadius: 5, border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--text-muted)" }}>
                        +{unassigned.length - 8}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right: image pool */}
        <div style={{ position: "sticky", top: 20 }}>
          <h2 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
            All images ({allAvailable.length})
          </h2>
          <div style={{ ...card, maxHeight: "72vh", overflowY: "auto" }}>
            {allAvailable.length === 0 ? (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", textAlign: "center", padding: "2rem 0" }}>No images extracted</p>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                  {allAvailable.map(img => {
                    const isAssigned = assignedIndices.has(img.index);
                    return (
                      <div key={img.index} style={{ position: "relative" }}>
                        <img
                          src={img.url}
                          onClick={() => setPreview(img.url)}
                          style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 6, border: `2px solid ${isAssigned ? "rgba(74,222,128,0.4)" : "var(--border)"}`, cursor: "pointer", opacity: isAssigned ? 0.55 : 1 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                          alt={`img-${img.index}`}
                        />
                        {isAssigned && (
                          <div style={{ position: "absolute", top: 2, right: 2, width: 14, height: 14, borderRadius: "50%", background: "#4ade80", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#000", fontWeight: 700 }}>✓</div>
                        )}
                        {img.page && (
                          <div style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "center", marginTop: 1 }}>p.{img.page}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: "0.75rem", padding: "0.625rem", background: "var(--bg-main)", borderRadius: 7, fontSize: "0.6875rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                  <span style={{ color: "#4ade80" }}>✓ assigned</span> · unassigned · click to preview · max 3/section
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
