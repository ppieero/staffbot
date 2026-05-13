"use client";

import { useEffect, useState, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

// ── Types ──────────────────────────────────────────────────────────────────────

type SyncStatus = "pending" | "syncing" | "synced" | "error";
type ObjectType = "database" | "page";
type ResourceCategory = "agenda" | "document" | "custom";

interface NotionConnection {
  connected: boolean;
  workspaceName?: string;
  workspaceIcon?: string | null;
  workspaceId?: string;
  connectedAt?: string;
}

interface NotionObject {
  id: string;
  title: string;
  type: ObjectType;
  icon: string | null;
}

interface NotionResource {
  id: string;
  notionObjectId: string;
  title: string;
  objectType: ObjectType;
  resourceCategory: ResourceCategory;
  syncStatus: SyncStatus;
  chunkCount: number | null;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  profileIds: string[];
  createdAt: string;
}

interface Profile {
  id: string;
  name: string;
  status: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SYNC_COLORS: Record<SyncStatus, { bg: string; color: string; border: string }> = {
  pending:  { bg: "rgba(251,191,36,0.08)",  color: "#fbbf24", border: "rgba(251,191,36,0.25)" },
  syncing:  { bg: "rgba(96,165,250,0.08)",  color: "#60a5fa", border: "rgba(96,165,250,0.25)" },
  synced:   { bg: "rgba(74,222,128,0.08)",  color: "#4ade80", border: "rgba(74,222,128,0.25)" },
  error:    { bg: "rgba(248,113,113,0.08)", color: "#f87171", border: "rgba(248,113,113,0.25)" },
};

const CAT_COLORS: Record<ResourceCategory, { bg: string; color: string; border: string }> = {
  agenda:   { bg: "rgba(167,139,250,0.08)", color: "#a78bfa", border: "rgba(167,139,250,0.25)" },
  document: { bg: "rgba(96,165,250,0.08)",  color: "#60a5fa", border: "rgba(96,165,250,0.25)" },
  custom:   { bg: "rgba(156,163,175,0.08)", color: "#9ca3af", border: "rgba(156,163,175,0.25)" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

function Badge({ label, style }: { label: string; style: { bg: string; color: string; border: string } }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
      background: style.bg, color: style.color, border: `1px solid ${style.border}`,
    }}>
      {label}
    </span>
  );
}

// ── Profile picker modal ───────────────────────────────────────────────────────

function ProfilePickerModal({
  profiles,
  selected,
  onSave,
  onClose,
  t,
}: {
  profiles: Profile[];
  selected: string[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(selected));

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12,
        padding: 24, minWidth: 340, maxWidth: 420,
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>
          {t("notion.selectProfiles")}
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {profiles.filter((p) => p.status === "active").map((p) => (
            <label key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              padding: "8px 12px", borderRadius: 8,
              background: checked.has(p.id) ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${checked.has(p.id) ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)"}`,
              transition: "all 0.15s",
            }}>
              <input
                type="checkbox"
                checked={checked.has(p.id)}
                onChange={() => toggle(p.id)}
                style={{ accentColor: "#6366f1" }}
              />
              <span style={{ fontSize: 13, color: "#cbd5e1" }}>{p.name}</span>
            </label>
          ))}
          {profiles.filter((p) => p.status === "active").length === 0 && (
            <p style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}>
              {t("notion.noProfiles")}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
            background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13,
          }}>
            {t("notion.cancel")}
          </button>
          <button onClick={() => onSave(Array.from(checked))} style={{
            padding: "7px 16px", borderRadius: 8, border: "none",
            background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>
            {t("notion.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Resource modal ─────────────────────────────────────────────────────────

function AddResourceModal({
  objects,
  profiles,
  onAdd,
  onClose,
  t,
}: {
  objects: NotionObject[];
  profiles: Profile[];
  onAdd: (data: { notionObjectId: string; title: string; objectType: ObjectType; resourceCategory: ResourceCategory; profileIds: string[] }) => void;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const [selected, setSelected] = useState<NotionObject | null>(null);
  const [category, setCategory] = useState<ResourceCategory>("document");
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const filtered = objects.filter((o) =>
    o.title.toLowerCase().includes(search.toLowerCase())
  );

  function toggleProfile(id: string) {
    setProfileIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12,
        padding: 24, width: 480, maxHeight: "80vh", overflowY: "auto",
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>
          {t("notion.addResource")}
        </h3>

        {/* Search */}
        <input
          placeholder="Buscar página o base de datos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", marginBottom: 12,
            padding: "8px 12px", borderRadius: 8, fontSize: 13,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#f1f5f9", outline: "none",
          }}
        />

        {/* Object list */}
        <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 16, display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map((obj) => (
            <button key={obj.id} onClick={() => setSelected(obj)} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left",
              background: selected?.id === obj.id ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${selected?.id === obj.id ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)"}`,
              color: "#cbd5e1", fontSize: 13, width: "100%",
            }}>
              <span>{obj.icon ?? (obj.type === "database" ? "🗄️" : "📄")}</span>
              <span style={{ flex: 1 }}>{obj.title}</span>
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {obj.type === "database" ? t("notion.type.database") : t("notion.type.page")}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", padding: 16 }}>
              Sin resultados
            </p>
          )}
        </div>

        {/* Category */}
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, display: "block" }}>
            {t("notion.resourceCategory")}
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ResourceCategory)}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#f1f5f9", outline: "none",
            }}
          >
            <option value="document">{t("notion.category.document")}</option>
            <option value="agenda">{t("notion.category.agenda")}</option>
            <option value="custom">{t("notion.category.custom")}</option>
          </select>
        </label>

        {/* Profiles */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6, display: "block" }}>
            {t("notion.assignedProfiles")}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {profiles.filter((p) => p.status === "active").map((p) => (
              <label key={p.id} style={{
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                padding: "6px 10px", borderRadius: 6,
                background: profileIds.includes(p.id) ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${profileIds.includes(p.id) ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.06)"}`,
              }}>
                <input
                  type="checkbox"
                  checked={profileIds.includes(p.id)}
                  onChange={() => toggleProfile(p.id)}
                  style={{ accentColor: "#6366f1" }}
                />
                <span style={{ fontSize: 13, color: "#cbd5e1" }}>{p.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
            background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13,
          }}>
            {t("notion.cancel")}
          </button>
          <button
            disabled={!selected}
            onClick={() => selected && onAdd({ notionObjectId: selected.id, title: selected.title, objectType: selected.type, resourceCategory: category, profileIds })}
            style={{
              padding: "7px 16px", borderRadius: 8, border: "none",
              background: selected ? "#6366f1" : "#374151", color: "#fff",
              cursor: selected ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600,
            }}
          >
            {t("notion.addResource")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function NotionPageInner() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showBrowse, setShowBrowse] = useState(false);
  const [profileModal, setProfileModal] = useState<{ resourceId: string; current: string[] } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  // Handle OAuth redirect result
  useEffect(() => {
    if (searchParams.get("connected") === "true") showToast(t("notion.connected"));
    if (searchParams.get("error")) showToast(`Error: ${searchParams.get("error")}`, false);
  }, []);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: connData, isLoading: connLoading } = useQuery<NotionConnection>({
    queryKey: ["notion-status"],
    queryFn: () => api.get("/integrations/notion").then((r) => r.data),
  });

  const { data: resourcesData, isLoading: resLoading } = useQuery<{ resources: NotionResource[] }>({
    queryKey: ["notion-resources"],
    queryFn: () => api.get("/integrations/notion/resources").then((r) => r.data),
  });

  const { data: browseData, isLoading: browseLoading, refetch: refetchBrowse } = useQuery<{ objects: NotionObject[] }>({
    queryKey: ["notion-browse"],
    queryFn: () => api.get("/integrations/notion/resources/browse").then((r) => r.data),
    enabled: showBrowse,
  });

  // Profile API returns { data: Profile[], meta: {...} } — not { profiles: [] }
  const { data: profilesData } = useQuery<{ data: Profile[] }>({
    queryKey: ["profiles"],
    queryFn: () => api.get("/profiles?limit=200").then((r) => r.data),
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const startOAuth = useMutation({
    mutationFn: () => api.get("/integrations/notion/auth").then((r) => r.data as { url: string }),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: () => showToast("Error al iniciar OAuth", false),
  });

  const disconnect = useMutation({
    mutationFn: () => api.delete("/integrations/notion"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notion-status"] });
      showToast(t("notion.disconnect"));
    },
    onError: () => showToast("Error al desconectar", false),
  });

  const addResource = useMutation({
    mutationFn: (data: { notionObjectId: string; title: string; objectType: ObjectType; resourceCategory: ResourceCategory; profileIds: string[] }) =>
      api.post("/integrations/notion/resources", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notion-resources"] });
      setShowBrowse(false);
      showToast(t("notion.addResource"));
    },
    onError: () => showToast("Error al agregar recurso", false),
  });

  const deleteResource = useMutation({
    mutationFn: (id: string) => api.delete(`/integrations/notion/resources/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notion-resources"] });
      showToast(t("notion.delete"));
    },
    onError: () => showToast("Error al eliminar", false),
  });

  const syncResource = useMutation({
    mutationFn: (id: string) => api.post(`/integrations/notion/resources/${id}/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notion-resources"] });
      showToast(t("notion.syncEnqueued"));
    },
    onError: () => showToast("Error al sincronizar", false),
  });

  const updateProfiles = useMutation({
    mutationFn: ({ resourceId, profileIds }: { resourceId: string; profileIds: string[] }) =>
      api.put(`/integrations/notion/resources/${resourceId}/profiles`, { profileIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notion-resources"] });
      setProfileModal(null);
      showToast(t("notion.save"));
    },
    onError: () => showToast("Error al actualizar profiles", false),
  });

  // ── Render ───────────────────────────────────────────────────────────────────

  const conn = connData;
  const resources = resourcesData?.resources ?? [];
  const profiles = profilesData?.data ?? [];
  const objects = browseData?.objects ?? [];

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 100,
          padding: "12px 20px", borderRadius: 10,
          background: toast.ok ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
          border: `1px solid ${toast.ok ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
          color: toast.ok ? "#4ade80" : "#f87171",
          fontSize: 13, fontWeight: 500,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>
          {t("notion.title")}
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#64748b" }}>
          {t("notion.subtitle")}
        </p>
      </div>

      {/* Connection card */}
      <div style={{
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12, padding: 24, marginBottom: conn?.connected ? 28 : 20,
      }}>
        {connLoading ? (
          <p style={{ color: "#64748b", fontSize: 14 }}>Cargando…</p>
        ) : conn?.connected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {conn.workspaceIcon && (
                <span style={{ fontSize: 28 }}>{conn.workspaceIcon}</span>
              )}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Badge label={t("notion.connected")} style={SYNC_COLORS.synced} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>
                    {conn.workspaceName}
                  </span>
                </div>
                {conn.connectedAt && (
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                    {t("notion.connectedAt")}: {fmtDate(conn.connectedAt)}
                  </p>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => startOAuth.mutate()}
                disabled={startOAuth.isPending}
                style={{
                  padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 500,
                  background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa",
                  opacity: startOAuth.isPending ? 0.7 : 1,
                }}
              >
                {startOAuth.isPending ? "Redirigiendo…" : "Reconectar / más páginas"}
              </button>
              <button
                onClick={() => {
                  if (confirm(t("notion.confirmDisconnect"))) disconnect.mutate();
                }}
                style={{
                  padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 500,
                  background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171",
                }}
              >
                {t("notion.disconnect")}
              </button>
            </div>
          </div>
        ) : (
          /* ── NOT CONNECTED: full setup guide ── */
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
              <div>
                <p style={{ margin: 0, fontSize: 15, color: "#f1f5f9", fontWeight: 600 }}>
                  Conecta tu workspace de Notion
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                  Sigue los pasos para importar agendas y documentación directamente desde Notion.
                </p>
              </div>
              <button
                onClick={() => startOAuth.mutate()}
                disabled={startOAuth.isPending}
                style={{
                  padding: "10px 22px", borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 700,
                  background: "#6366f1", border: "none", color: "#fff",
                  opacity: startOAuth.isPending ? 0.7 : 1, whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                {startOAuth.isPending ? "Redirigiendo…" : "Conectar con Notion →"}
              </button>
            </div>

            {/* Step-by-step guide */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                {
                  step: "1",
                  title: "Haz clic en «Conectar con Notion»",
                  desc: "Te redirigiremos a Notion para autorizar el acceso. Asegúrate de estar logueado con la cuenta correcta.",
                  tip: null,
                },
                {
                  step: "2",
                  title: "Selecciona las páginas y bases de datos",
                  desc: "Notion te mostrará una pantalla para elegir qué páginas o bases de datos comparte con StaffBot.",
                  tip: "Selecciona todas las páginas y bases de datos que quieras usar (agendas, documentos, etc.). Si después necesitas agregar más, usa el botón «Reconectar / más páginas».",
                },
                {
                  step: "3",
                  title: "Agrega recursos desde el explorador",
                  desc: "Después de conectar, verás el botón «+ Agregar recurso». Úsalo para elegir qué páginas o bases de datos sincronizar con StaffBot.",
                  tip: null,
                },
                {
                  step: "4",
                  title: "Asigna cada recurso a los profiles correctos",
                  desc: "Puedes asignar cada recurso solo a ciertos profiles. Por ejemplo: la agenda solo al profile «Ventas», los procedimientos solo a «Operaciones».",
                  tip: "Los empleados de un profile solo verán el contenido de los recursos asignados a ese profile.",
                },
                {
                  step: "5",
                  title: "El contenido ya está disponible para tus empleados",
                  desc: "Cuando un empleado pregunte por WhatsApp o Telegram, el bot buscará también en el contenido de Notion sincronizado.",
                  tip: null,
                },
              ].map((s, i, arr) => (
                <div key={s.step} style={{ display: "flex", gap: 0 }}>
                  {/* Line + circle */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 36, flexShrink: 0 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                      background: "rgba(99,102,241,0.15)", border: "1.5px solid rgba(99,102,241,0.4)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, color: "#a5b4fc",
                    }}>
                      {s.step}
                    </div>
                    {i < arr.length - 1 && (
                      <div style={{ width: 1.5, flex: 1, minHeight: 12, background: "rgba(99,102,241,0.2)", margin: "4px 0" }} />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ paddingLeft: 14, paddingBottom: i < arr.length - 1 ? 20 : 0 }}>
                    <p style={{ margin: "3px 0 4px", fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
                      {s.title}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                      {s.desc}
                    </p>
                    {s.tip && (
                      <div style={{
                        marginTop: 8, padding: "8px 12px", borderRadius: 8,
                        background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)",
                        fontSize: 12, color: "#fbbf24", lineHeight: 1.5,
                      }}>
                        💡 {s.tip}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Resources section */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#f1f5f9" }}>
          {t("notion.resources")}
        </h2>
        {conn?.connected && (
          <button
            onClick={() => { setShowBrowse(true); refetchBrowse(); }}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600,
              background: "#6366f1", border: "none", color: "#fff",
            }}
          >
            + {t("notion.addResource")}
          </button>
        )}
      </div>

      {resLoading ? (
        <p style={{ color: "#64748b", fontSize: 14 }}>Cargando…</p>
      ) : resources.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 24px",
          background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 12,
        }}>
          <p style={{ margin: "0 0 6px", fontSize: 15, color: "#94a3b8", fontWeight: 500 }}>
            {t("notion.noResources")}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            {t("notion.noResourcesHint")}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {resources.map((r) => {
            const assignedProfiles = profiles.filter((p) => r.profileIds.includes(p.id));
            return (
              <div key={r.id} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10, padding: "16px 20px",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", wordBreak: "break-word" }}>
                        {r.objectType === "database" ? "🗄️" : "📄"} {r.title}
                      </span>
                      <Badge
                        label={r.resourceCategory === "agenda" ? t("notion.category.agenda") : r.resourceCategory === "document" ? t("notion.category.document") : t("notion.category.custom")}
                        style={CAT_COLORS[r.resourceCategory]}
                      />
                      <Badge
                        label={t(`notion.status.${r.syncStatus}`)}
                        style={SYNC_COLORS[r.syncStatus]}
                      />
                    </div>

                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                      <span>{r.objectType === "database" ? t("notion.type.database") : t("notion.type.page")}</span>
                      {r.lastSyncedAt && (
                        <span>{t("notion.lastSynced")}: {fmtDate(r.lastSyncedAt)}</span>
                      )}
                      {r.chunkCount != null && (
                        <span>{r.chunkCount} {t("notion.chunks")}</span>
                      )}
                      {r.errorMessage && (
                        <span style={{ color: "#f87171" }}>{r.errorMessage}</span>
                      )}
                    </div>

                    {/* Assigned profiles */}
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#64748b" }}>{t("notion.assignedProfiles")}:</span>
                      {assignedProfiles.length === 0 ? (
                        <span style={{ fontSize: 11, color: "#64748b", fontStyle: "italic" }}>{t("notion.noProfiles")}</span>
                      ) : (
                        assignedProfiles.map((p) => (
                          <span key={p.id} style={{
                            fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 500,
                            background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc",
                          }}>
                            {p.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => setProfileModal({ resourceId: r.id, current: r.profileIds })}
                      title={t("notion.editProfiles")}
                      style={{
                        padding: "6px 12px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontWeight: 500,
                        background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc",
                      }}
                    >
                      {t("notion.editProfiles")}
                    </button>
                    <button
                      onClick={() => syncResource.mutate(r.id)}
                      disabled={r.syncStatus === "syncing" || syncResource.isPending}
                      title={t("notion.sync")}
                      style={{
                        padding: "6px 12px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontWeight: 500,
                        background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa",
                        opacity: r.syncStatus === "syncing" ? 0.6 : 1,
                      }}
                    >
                      {t("notion.sync")}
                    </button>
                    <button
                      onClick={() => { if (confirm(t("notion.confirmDelete"))) deleteResource.mutate(r.id); }}
                      title={t("notion.delete")}
                      style={{
                        padding: "6px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                        background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Browse / Add modal */}
      {showBrowse && (
        <AddResourceModal
          objects={browseLoading ? [] : objects}
          profiles={profiles}
          onAdd={(data) => addResource.mutate(data)}
          onClose={() => setShowBrowse(false)}
          t={t}
        />
      )}

      {/* Profile picker modal */}
      {profileModal && (
        <ProfilePickerModal
          profiles={profiles}
          selected={profileModal.current}
          onSave={(ids) => updateProfiles.mutate({ resourceId: profileModal.resourceId, profileIds: ids })}
          onClose={() => setProfileModal(null)}
          t={t}
        />
      )}
    </div>
  );
}

export default function NotionIntegrationPage() {
  return (
    <Suspense fallback={null}>
      <NotionPageInner />
    </Suspense>
  );
}
