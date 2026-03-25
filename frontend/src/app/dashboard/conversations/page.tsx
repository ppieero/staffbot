"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConversationItem {
  id: string;
  status: "open" | "closed" | "escalated";
  channel: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  lastContent: string | null;
  lastRole: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    lang: string;
  };
  profile: {
    id: string;
    name: string;
  };
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: { document_id?: string; chunk_id?: string; score?: number; excerpt?: string }[] | null;
  tokensUsed: number | null;
  latencyMs: number | null;
  sentAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  open:      { bg: "rgba(34,197,94,0.12)",  color: "#4ade80", label: "Open" },
  closed:    { bg: "rgba(100,116,139,0.15)", color: "#94a3b8", label: "Closed" },
  escalated: { bg: "rgba(234,179,8,0.12)",  color: "#facc15", label: "Escalated" },
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ConversationsPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── List query
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["conversations", statusFilter, search],
    queryFn: async () => {
      const params: Record<string, string> = { limit: "100" };
      if (statusFilter !== "all") params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get("/conversations", { params });
      return data as { data: ConversationItem[]; meta: { total: number } };
    },
    refetchInterval: 5000,
  });

  const convList = useMemo(() => listData?.data ?? [], [listData]);

  // Auto-select first conversation
  useEffect(() => {
    if (!selectedId && convList.length > 0) {
      setSelectedId(convList[0].id);
    }
  }, [convList, selectedId]);

  const selectedConv = convList.find((c) => c.id === selectedId) ?? null;

  // ── Messages query
  const { data: msgData, isLoading: msgLoading } = useQuery({
    queryKey: ["conversation-messages", selectedId],
    queryFn: async () => {
      const { data } = await api.get(`/conversations/${selectedId}/messages`);
      return data as { data: Message[] };
    },
    enabled: !!selectedId,
    refetchInterval: selectedConv?.status === "open" ? 5000 : false,
  });

  const msgs = msgData?.data ?? [];

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  // ── Status mutation
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await api.patch(`/conversations/${id}/status`, { status });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation-messages", selectedId] });
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "calc(100vh - 4rem)", gap: 0, margin: "-2rem", overflow: "hidden" }}>

      {/* ── Left panel: conversation list ── */}
      <div
        style={{
          width: 340,
          minWidth: 340,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-sidebar)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "1.25rem 1rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
          <h1 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 0.75rem" }}>
            Conversations
            <span style={{ marginLeft: 8, fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)", background: "var(--bg-card)", padding: "2px 7px", borderRadius: 999, border: "1px solid var(--border)" }}>
              {listData?.meta.total ?? 0}
            </span>
          </h1>

          {/* Search */}
          <div style={{ position: "relative", marginBottom: "0.625rem" }}>
            <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee…"
              style={{
                width: "100%", boxSizing: "border-box",
                paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text-primary)", fontSize: "0.8125rem",
                outline: "none",
              }}
            />
          </div>

          {/* Status filter tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {["all", "open", "escalated", "closed"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  flex: 1, padding: "4px 0", borderRadius: 5, border: "none", cursor: "pointer",
                  fontSize: "0.6875rem", fontWeight: 500, textTransform: "capitalize",
                  background: statusFilter === s ? "var(--accent)" : "var(--bg-card)",
                  color: statusFilter === s ? "#fff" : "var(--text-muted)",
                  transition: "all 0.15s",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {listLoading ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Loading…
            </div>
          ) : convList.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              No conversations found
            </div>
          ) : (
            convList.map((conv) => {
              const active = conv.id === selectedId;
              const st = STATUS_COLOR[conv.status] ?? STATUS_COLOR.closed;
              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  style={{
                    padding: "0.75rem 1rem",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    background: active ? "rgba(99,102,241,0.08)" : "transparent",
                    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                      {conv.employee.firstName} {conv.employee.lastName}
                    </span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", flexShrink: 0, marginLeft: 8 }}>
                      {fmtTime(conv.lastMessageAt)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: "0.6875rem", padding: "1px 6px", borderRadius: 4, background: st.bg, color: st.color, fontWeight: 500 }}>
                      {st.label}
                    </span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                      {conv.profile.name}
                    </span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                      {conv.messageCount} msg{conv.messageCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {conv.lastContent && (
                    <div style={{
                      fontSize: "0.75rem", color: "var(--text-muted)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      opacity: 0.8,
                    }}>
                      {conv.lastRole === "assistant" ? "Bot: " : ""}{conv.lastContent}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right panel: message thread ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-base)" }}>
        {!selectedConv ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
            <div style={{ textAlign: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 1rem", opacity: 0.4 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p style={{ fontSize: "0.875rem" }}>Select a conversation</p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div
              style={{
                padding: "1rem 1.5rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                background: "var(--bg-card)",
                flexShrink: 0,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "var(--accent)", display: "flex",
                      alignItems: "center", justifyContent: "center",
                      fontSize: "0.8125rem", fontWeight: 700, color: "#fff", flexShrink: 0,
                    }}
                  >
                    {selectedConv.employee.firstName[0]}{selectedConv.employee.lastName[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-primary)" }}>
                      {selectedConv.employee.firstName} {selectedConv.employee.lastName}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {selectedConv.employee.phone ?? "—"} · {selectedConv.profile.name} · lang: {selectedConv.employee.lang}
                    </div>
                  </div>
                </div>
              </div>

              {/* Status badge + action */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {(() => {
                  const st = STATUS_COLOR[selectedConv.status] ?? STATUS_COLOR.closed;
                  return (
                    <span style={{ padding: "3px 10px", borderRadius: 6, background: st.bg, color: st.color, fontSize: "0.75rem", fontWeight: 600 }}>
                      {st.label}
                    </span>
                  );
                })()}

                {selectedConv.status === "open" && (
                  <button
                    onClick={() => statusMutation.mutate({ id: selectedConv.id, status: "closed" })}
                    disabled={statusMutation.isPending}
                    style={{
                      padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)",
                      background: "transparent", color: "var(--text-secondary)", fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                )}
                {selectedConv.status === "closed" && (
                  <button
                    onClick={() => statusMutation.mutate({ id: selectedConv.id, status: "open" })}
                    disabled={statusMutation.isPending}
                    style={{
                      padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)",
                      background: "transparent", color: "var(--text-secondary)", fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    Reopen
                  </button>
                )}
                {selectedConv.status !== "escalated" && (
                  <button
                    onClick={() => statusMutation.mutate({ id: selectedConv.id, status: "escalated" })}
                    disabled={statusMutation.isPending}
                    style={{
                      padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(234,179,8,0.3)",
                      background: "rgba(234,179,8,0.08)", color: "#facc15", fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    Escalate
                  </button>
                )}
              </div>

              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", flexShrink: 0 }}>
                Started {fmtFull(selectedConv.startedAt)}
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {msgLoading ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", paddingTop: "2rem" }}>Loading messages…</div>
              ) : msgs.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", paddingTop: "2rem" }}>No messages yet</div>
              ) : (
                msgs.map((msg) => {
                  const isUser = msg.role === "user";
                  const isAssistant = msg.role === "assistant";
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: isUser ? "flex-end" : "flex-start",
                        maxWidth: "100%",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexDirection: isUser ? "row-reverse" : "row" }}>
                        {/* Avatar */}
                        <div
                          style={{
                            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                            background: isUser ? "#334155" : "var(--accent)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.625rem", fontWeight: 700, color: "#fff",
                          }}
                        >
                          {isUser ? "U" : "B"}
                        </div>

                        {/* Bubble */}
                        <div
                          style={{
                            maxWidth: "70%",
                            padding: "0.625rem 0.875rem",
                            borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                            background: isUser ? "#1e3a5f" : "var(--bg-card)",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                            fontSize: "0.875rem",
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {msg.content}
                        </div>
                      </div>

                      {/* Metadata row */}
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: 10, marginTop: 4,
                          paddingLeft: isUser ? 0 : 36, paddingRight: isUser ? 36 : 0,
                          fontSize: "0.6875rem", color: "var(--text-muted)",
                        }}
                      >
                        <span>{fmtFull(msg.sentAt)}</span>
                        {isAssistant && msg.tokensUsed != null && (
                          <span style={{ color: "var(--text-muted)", opacity: 0.7 }}>{msg.tokensUsed} tok</span>
                        )}
                        {isAssistant && msg.latencyMs != null && (
                          <span style={{ color: "var(--text-muted)", opacity: 0.7 }}>{msg.latencyMs}ms</span>
                        )}
                        {isAssistant && msg.sources && msg.sources.length > 0 && (
                          <details style={{ display: "inline" }}>
                            <summary style={{ cursor: "pointer", color: "#a5b4fc", listStyle: "none" }}>
                              {msg.sources.length} source{msg.sources.length !== 1 ? "s" : ""}
                            </summary>
                            <div
                              style={{
                                marginTop: 4, padding: "0.5rem 0.75rem",
                                background: "var(--bg-card)", border: "1px solid var(--border)",
                                borderRadius: 6, fontSize: "0.6875rem", lineHeight: 1.6,
                                maxWidth: 400,
                              }}
                            >
                              {msg.sources.map((s, i) => (
                                <div key={i} style={{ marginBottom: i < msg.sources!.length - 1 ? 6 : 0 }}>
                                  <span style={{ color: "#a5b4fc" }}>#{i + 1}</span>
                                  {s.score != null && <span style={{ marginLeft: 6, color: "var(--text-muted)" }}>score: {s.score.toFixed(3)}</span>}
                                  {s.excerpt && <div style={{ marginTop: 2, color: "var(--text-secondary)", fontStyle: "italic" }}>&ldquo;{s.excerpt}&rdquo;</div>}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
