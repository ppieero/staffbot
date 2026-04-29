"use client";
import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface Section {
  id:          string;
  title:       string;
  contentHtml: string;
  sectionType: string;
  orderIndex:  number;
  images:      { url: string; page?: number | null; index?: number }[];
}

interface Manual {
  id:         string;
  title:      string;
  language:   string;
  tenantName: string;
  sections:   Section[];
}

function ManualViewerContent() {
  const { tenantSlug, manualSlug } = useParams<{ tenantSlug: string; manualSlug: string }>();
  const searchParams               = useSearchParams();
  const [manual, setManual]        = useState<Manual | null>(null);
  const [activeSection, setActive] = useState(() => {
    const s = searchParams.get("s");
    const n = s !== null ? parseInt(s, 10) : NaN;
    return isNaN(n) ? 0 : n;
  });
  const [loading, setLoading]      = useState(true);
  const [error, setError]          = useState("");

  useEffect(() => {
    fetch(`/api/manuals/public/${tenantSlug}/${manualSlug}`)
      .then(r => r.json())
      .then((d: Manual & { error?: string }) => {
        if (d.error) setError(d.error);
        else {
          setManual(d);
          setActive(prev => Math.min(prev, d.sections.length - 1));
        }
      })
      .catch(() => setError("Could not load manual"))
      .finally(() => setLoading(false));
  }, [tenantSlug, manualSlug]);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f8f8" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #378ADD", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ color: "#666", fontSize: 14 }}>Loading manual...</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  if (error || !manual) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f8f8" }}>
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <p style={{ fontSize: 48, marginBottom: 16 }}>📄</p>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: "#1a1a1a", marginBottom: 8 }}>Manual not found</h1>
        <p style={{ color: "#666", fontSize: 14 }}>{error || "This manual is not available"}</p>
      </div>
    </div>
  );

  const section = manual.sections[activeSection];
  const progress = ((activeSection + 1) / manual.sections.length) * 100;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .sb-section-body{font-size:15px;line-height:1.75;color:#1a1a1a;margin-bottom:16px}
        .sb-steps{padding-left:0;list-style:none;counter-reset:steps;margin-bottom:20px}
        .sb-step{counter-increment:steps;display:flex;align-items:flex-start;gap:14px;padding:12px 0;border-bottom:1px solid #e8e8e8}
        .sb-step:last-child{border-bottom:none}
        .sb-step-num{min-width:32px;height:32px;border-radius:50%;background:#185FA5;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
        .sb-step-text{font-size:14px;color:#1a1a1a;line-height:1.6;flex:1;padding-top:6px}
        .sb-step:not(:has(.sb-step-num))::before{content:counter(steps);min-width:32px;height:32px;border-radius:50%;background:#185FA5;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
        .sb-step:not(:has(.sb-step-num)) > :not(style){color:#1a1a1a;font-size:14px;line-height:1.6;padding-top:6px}
        .sb-checklist{list-style:none;padding:0;margin-bottom:16px}
        .sb-check{display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1a1a1a;line-height:1.5}
        .sb-check:last-child{border-bottom:none}
        .sb-check-box{min-width:20px;height:20px;border:2px solid #185FA5;border-radius:4px;flex-shrink:0;margin-top:2px}
        .sb-note{background:#FFF8E7;border-left:4px solid #EF9F27;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:12px;font-size:13px;color:#4a3000;line-height:1.6}
        .sb-note-label{display:block;font-size:10px;font-weight:700;color:#854F0B;margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em}
        .sb-note p{color:#4a3000;margin:0}
        .sb-warning{background:#FFF0F0;border-left:4px solid #E53E3E;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:12px;display:flex;gap:10px;align-items:flex-start}
        .sb-warning-icon{font-size:18px;flex-shrink:0}
        .sb-warning strong{display:block;font-size:12px;font-weight:700;color:#C53030;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
        .sb-warning p{font-size:13px;color:#742A2A;line-height:1.6;margin:0}
        @media(max-width:640px){
          .sb-step-num{min-width:28px;height:28px;font-size:12px}
          .sb-section-body{font-size:14px}
        }
      `}</style>

      {/* Header */}
      <div style={{ background: "#185FA5", color: "#fff", padding: "16px 20px" }}>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {manual.tenantName}
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 500, margin: 0, lineHeight: 1.3 }}>{manual.title}</h1>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{manual.sections.length} sections</div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: "#dbeafe" }}>
        <div style={{ height: "100%", background: "#378ADD", width: `${progress}%`, transition: "width 0.3s ease" }} />
      </div>

      {/* Section tab strip — horizontal scroll */}
      <div style={{ background: "#fff", borderBottom: "0.5px solid #e5e7eb", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "flex", padding: "0 4px", minWidth: "max-content" }}>
          {manual.sections.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActive(i)}
              style={{
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: activeSection === i ? 600 : 400,
                color: activeSection === i ? "#185FA5" : "#666",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${activeSection === i ? "#185FA5" : "transparent"}`,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}
            >
              {i + 1}. {s.title.length > 22 ? s.title.slice(0, 22) + "…" : s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Section content */}
      {section && (
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 20px 100px" }}>
          <div style={{ fontSize: 11, color: "#378ADD", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Section {activeSection + 1} of {manual.sections.length}
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "#1a1a1a", marginBottom: 16, lineHeight: 1.3 }}>
            {section.title}
          </h2>
          <div dangerouslySetInnerHTML={{ __html: section.contentHtml }} />

          {Array.isArray(section.images) && section.images.length > 0 && (
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              {section.images.slice(0, 3).map((img, i) => (
                <div key={i} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                  <img
                    src={img.url}
                    alt={`Section image ${i + 1}`}
                    style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 320, background: "#f9fafb" }}
                    onError={e => {
                      const el = e.target as HTMLImageElement;
                      if (el.parentElement) el.parentElement.style.display = "none";
                    }}
                    loading="lazy"
                  />
                  {img.page && (
                    <div style={{ padding: "4px 10px", background: "#f9fafb", fontSize: 10, color: "#9ca3af", borderTop: "1px solid #e5e7eb" }}>
                      Page {img.page}
                    </div>
                  )}
                </div>
              ))}
              {section.images.length > 3 && (
                <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", margin: 0 }}>
                  +{section.images.length - 3} more images in original document
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fixed bottom navigation */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#fff",
        borderTop: "0.5px solid #e5e7eb",
        padding: "12px 20px",
        display: "flex",
        gap: 10,
      }}>
        <button
          onClick={() => { setActive(Math.max(0, activeSection - 1)); window.scrollTo(0, 0); }}
          disabled={activeSection === 0}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: 10,
            border: "0.5px solid #ddd",
            background: "transparent",
            color: activeSection === 0 ? "#ccc" : "#333",
            fontSize: 14,
            cursor: activeSection === 0 ? "not-allowed" : "pointer",
          }}
        >
          ← Prev
        </button>
        <button
          onClick={() => {
            if (activeSection < manual.sections.length - 1) {
              setActive(activeSection + 1);
              window.scrollTo(0, 0);
            }
          }}
          disabled={activeSection === manual.sections.length - 1}
          style={{
            flex: 2,
            padding: "12px",
            borderRadius: 10,
            border: "none",
            background: activeSection === manual.sections.length - 1 ? "#9ca3af" : "#185FA5",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: activeSection === manual.sections.length - 1 ? "not-allowed" : "pointer",
          }}
        >
          {activeSection === manual.sections.length - 1 ? "Completed ✓" : "Next section →"}
        </button>
      </div>
    </div>
  );
}

export default function ManualViewerPage() {
  return (
    <Suspense>
      <ManualViewerContent />
    </Suspense>
  );
}
