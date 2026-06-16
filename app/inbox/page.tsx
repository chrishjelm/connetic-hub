"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

type Unsub = { available: boolean; oneClick: boolean; url: string; mailto: string };

type MsgSummary = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  from?: { emailAddress?: { name?: string; address?: string } };
  unsub?: Unsub;
};

type MsgFull = MsgSummary & {
  body?: { contentType?: string; content?: string };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
};

const FOLDERS = [
  { key: "inbox", label: "Inbox" },
  { key: "archive", label: "Archive" },
  { key: "sentitems", label: "Sent" },
];

// Slice 1: in-inbox views layered on top of the inbox folder.
type ViewKey = "all" | "important";
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "important", label: "Important" },
];

// Per-message metadata the page tracks locally (not persisted server-side).
type MsgMeta = {
  priority?: "high" | "medium" | "low";
  reason?: string;
};

function rowAccent(priority?: string): string {
  if (priority === "high") return "var(--amber)";
  return "transparent";
}

function when(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function senderName(m: MsgSummary): string {
  return (
    m.from?.emailAddress?.name ||
    m.from?.emailAddress?.address ||
    "(unknown)"
  );
}

import { Suspense } from "react";

function InboxInner() {
  const [folder, setFolder] = useState("inbox");
  const [view, setView] = useState<ViewKey>("all");
  const [meta, setMeta] = useState<Record<string, MsgMeta>>({});
  const [prioritizing, setPrioritizing] = useState(false);
  const [list, setList] = useState<MsgSummary[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);

  const [sel, setSel] = useState<MsgFull | null>(null);
  const [selLoading, setSelLoading] = useState(false);

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [cTo, setCTo] = useState("");
  const [cSubject, setCSubject] = useState("");
  const [cBody, setCBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    category?: string;
    recommended?: string;
    reason?: string;
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const loadList = useCallback((f: string) => {
    setList(null);
    setListErr(null);
    setSel(null);
    setMeta({});
    setView("all");
    fetch(`/api/outlook-mail?folder=${f}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setList(d.messages || []);
        else setListErr(d.error || "Could not load mail");
      })
      .catch((e) => setListErr(String(e)));
  }, []);

  // Slice 1: rank the inbox once it loads, so the Important view and
  // the priority stripes have data. Only meaningful for the inbox folder.
  const prioritize = useCallback(() => {
    setPrioritizing(true);
    fetch("/api/outlook-mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prioritize" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.messages)) {
          setMeta((prev) => {
            const next = { ...prev };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const m of d.messages as any[]) {
              if (!m.id) continue;
              next[m.id] = {
                ...next[m.id],
                priority: m.priority,
                reason: m.reason,
              };
            }
            return next;
          });
        }
      })
      .catch(() => {
        /* non-critical: stripes just won't show */
      })
      .finally(() => setPrioritizing(false));
  }, []);

  const searchParams = useSearchParams();

  useEffect(() => {
    loadList(folder);
  }, [folder, loadList]);

  // Once the inbox list is in, rank it (inbox only).
  useEffect(() => {
    if (folder === "inbox" && list && list.length > 0) {
      prioritize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, folder]);

  // Deep-link: if ?id= is in the URL, auto-open that message.
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) return;
    open({ id } as MsgSummary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function open(m: MsgSummary) {
    setSelLoading(true);
    setReplyOpen(false);
    setReplyText("");
    setSuggestion(null);
    try {
      const r = await fetch(`/api/outlook-mail?id=${m.id}`);
      const d = await r.json();
      if (d.success) {
        setSel(d.message);
        analyze(m.id);
        if (!m.isRead) {
          fetch("/api/outlook-mail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "markRead", id: m.id }),
          });
          setList((prev) =>
            prev
              ? prev.map((x) => (x.id === m.id ? { ...x, isRead: true } : x))
              : prev
          );
        }
      } else {
        flash("Couldn't open message");
      }
    } finally {
      setSelLoading(false);
    }
  }

  async function act(action: string, id: string, extra: object = {}) {
    setBusy(action);
    try {
      const r = await fetch("/api/outlook-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, ...extra }),
      });
      const d = await r.json();
      if (!d.success) {
        flash(`Failed: ${d.error?.slice(0, 80) || action}`);
        return false;
      }
      return true;
    } catch (e) {
      flash(String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function doArchive() {
    if (!sel) return;
    const ok = await act("archive", sel.id);
    if (ok) {
      flash("Archived");
      setList((p) => (p ? p.filter((x) => x.id !== sel.id) : p));
      setSel(null);
    }
  }

  async function doDelete() {
    if (!sel) return;
    const ok = await act("delete", sel.id);
    if (ok) {
      flash("Deleted");
      setList((p) => (p ? p.filter((x) => x.id !== sel.id) : p));
      setSel(null);
    }
  }

  async function sendReply() {
    if (!sel || !replyText.trim()) return;
    const ok = await act("reply", sel.id, { content: replyText });
    if (ok) {
      flash("Reply sent");
      setReplyOpen(false);
      setReplyText("");
    }
  }

  async function suggestReply() {
    if (!sel) return;
    setSuggesting(true);
    try {
      const r = await fetch("/api/outlook-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest", id: sel.id }),
      });
      const d = await r.json();
      if (d.success) setReplyText(d.reply || "");
      else flash(`Couldn't draft: ${d.error?.slice(0, 60)}`);
    } catch (e) {
      flash(String(e));
    } finally {
      setSuggesting(false);
    }
  }

  async function analyze(id: string) {
    setAnalyzing(true);
    try {
      const r = await fetch("/api/outlook-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", id }),
      });
      const d = await r.json();
      if (d.success)
        setSuggestion({
          category: d.category,
          recommended: d.recommended,
          reason: d.reason,
        });
    } catch {
      /* non-critical */
    } finally {
      setAnalyzing(false);
    }
  }

  async function doUnsubscribe() {
    if (!sel) return;
    const extra = sel.unsub?.url ? { url: sel.unsub.url } : {};
    const ok = await act("unsubscribe", sel.id, extra);
    flash(ok ? "Unsubscribe sent" : "Couldn't unsubscribe");
  }

  async function unsubscribeAll() {
    if (!list) return;
    const targets = list.filter((m) => m.unsub?.oneClick && m.unsub?.url);
    if (!targets.length) {
      flash("Nothing here can be auto-unsubscribed");
      return;
    }
    setBusy("unsuball");
    let n = 0;
    for (const m of targets) {
      try {
        const r = await fetch("/api/outlook-mail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unsubscribe", url: m.unsub!.url }),
        });
        const d = await r.json();
        if (d.success) n++;
      } catch {
        /* skip */
      }
    }
    setBusy(null);
    flash(`Unsubscribed from ${n} of ${targets.length}`);
  }

  async function sendCompose() {
    if (!cTo.trim()) {
      flash("Add a recipient");
      return;
    }
    setBusy("send");
    try {
      const r = await fetch("/api/outlook-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          to: cTo,
          subject: cSubject,
          content: cBody,
        }),
      });
      const d = await r.json();
      if (d.success) {
        flash("Sent");
        setComposeOpen(false);
        setCTo("");
        setCSubject("");
        setCBody("");
      } else {
        flash(`Failed: ${d.error?.slice(0, 80)}`);
      }
    } finally {
      setBusy(null);
    }
  }

  const bodyHtml =
    sel?.body?.contentType?.toLowerCase() === "html"
      ? sel.body?.content || ""
      : `<pre style="white-space:pre-wrap;font-family:system-ui;font-size:14px;color:#111;padding:4px">${(
          sel?.body?.content || ""
        ).replace(/</g, "&lt;")}</pre>`;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          padding: "20px 28px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
            Inbox
          </h1>
          <div style={{ display: "flex", gap: 4 }}>
            {FOLDERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFolder(f.key)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 7,
                  fontSize: 13,
                  border: "none",
                  cursor: "pointer",
                  background:
                    folder === f.key ? "var(--surface-2)" : "transparent",
                  color:
                    folder === f.key
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  fontWeight: folder === f.key ? 500 : 400,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          {folder === "inbox" && (
            <div style={{ display: "flex", gap: 4, marginLeft: 6 }}>
              {VIEWS.map((v) => {
                const count =
                  v.key === "all"
                    ? list?.length || 0
                    : (list || []).filter(
                        (m) => meta[m.id]?.priority === "high"
                      ).length;
                return (
                  <button
                    key={v.key}
                    onClick={() => setView(v.key)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 7,
                      fontSize: 13,
                      border: "none",
                      cursor: "pointer",
                      background:
                        view === v.key ? "var(--accent)" : "transparent",
                      color:
                        view === v.key ? "#fff" : "var(--text-secondary)",
                      fontWeight: view === v.key ? 500 : 400,
                    }}
                  >
                    {v.label}
                    {v.key === "important" && count > 0 ? ` (${count})` : ""}
                    {v.key === "important" && prioritizing ? " …" : ""}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={unsubscribeAll}
            disabled={busy !== null}
            style={btnGhost}
          >
            {busy === "unsuball" ? "Unsubscribing…" : "Unsubscribe junk"}
          </button>
          <button onClick={() => loadList(folder)} style={btnGhost}>
            Refresh
          </button>
          <button onClick={() => setComposeOpen(true)} style={btnAccent(false)}>
            Compose
          </button>
        </div>
      </div>

      {/* Body: list + reader */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* List */}
        <div
          style={{
            width: 360,
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          {listErr && (
            <div style={{ padding: 20, color: "var(--amber)", fontSize: 13 }}>
              {listErr}
            </div>
          )}
          {list === null && !listErr && (
            <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>
              Loading…
            </div>
          )}
          {list && list.length === 0 && (
            <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>
              Nothing here.
            </div>
          )}
          {list
            ?.filter((m) =>
              folder === "inbox" && view === "important"
                ? meta[m.id]?.priority === "high"
                : true
            )
            .map((m) => {
            const active = sel?.id === m.id;
            const accent = rowAccent(meta[m.id]?.priority);
            return (
              <div
                key={m.id}
                onClick={() => open(m)}
                style={{
                  padding: "13px 18px",
                  borderBottom: "1px solid var(--border)",
                  borderLeft: `3px solid ${accent}`,
                  cursor: "pointer",
                  background: active ? "var(--surface-2)" : "transparent",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: m.isRead ? 400 : 700,
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {senderName(m)}
                  </span>
                  <span
                    style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}
                  >
                    {when(m.receivedDateTime)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: m.isRead ? 400 : 600,
                    color: "var(--text-secondary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {m.subject || "(no subject)"}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {m.bodyPreview}
                </div>
              </div>
            );
          })}
        </div>

        {/* Reader */}
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          {!sel && !selLoading && (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 14,
              }}
            >
              Select a message to read it.
            </div>
          )}
          {selLoading && (
            <div style={{ padding: 28, color: "var(--text-muted)", fontSize: 13 }}>
              Opening…
            </div>
          )}
          {sel && !selLoading && (
            <div style={{ padding: "24px 28px" }}>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                }}
              >
                {sel.subject || "(no subject)"}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
                <strong>{senderName(sel)}</strong>{" "}
                &lt;{sel.from?.emailAddress?.address}&gt;
              </div>
              <div
                style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}
              >
                {sel.receivedDateTime
                  ? new Date(sel.receivedDateTime).toLocaleString()
                  : ""}
              </div>

              {/* Action bar */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <button
                  onClick={() => setReplyOpen((v) => !v)}
                  style={btnAccent(false)}
                >
                  Reply
                </button>
                <button
                  onClick={doArchive}
                  disabled={busy !== null}
                  style={btnGhost}
                >
                  {busy === "archive" ? "…" : "Archive"}
                </button>
                {sel.unsub?.available && (
                  <button
                    onClick={doUnsubscribe}
                    disabled={busy !== null}
                    style={btnGhost}
                  >
                    {busy === "unsubscribe" ? "…" : "Unsubscribe"}
                  </button>
                )}
                <button
                  onClick={doDelete}
                  disabled={busy !== null}
                  style={{ ...btnGhost, color: "var(--amber)" }}
                >
                  {busy === "delete" ? "…" : "Delete"}
                </button>
              </div>

              {/* Claude's suggestion */}
              {(analyzing || suggestion) && (
                <div
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    marginBottom: 18,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {analyzing && (
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      ✨ Reading the message…
                    </span>
                  )}
                  {!analyzing && suggestion && (
                    <>
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          flex: 1,
                        }}
                      >
                        <strong style={{ color: "var(--accent)" }}>
                          {suggestion.category}
                        </strong>{" "}
                        — {suggestion.reason}
                      </span>
                      {suggestion.recommended === "reply" && (
                        <button
                          onClick={() => {
                            setReplyOpen(true);
                            suggestReply();
                          }}
                          style={btnAccent(false)}
                        >
                          Draft reply
                        </button>
                      )}
                      {suggestion.recommended === "archive" && (
                        <button onClick={doArchive} style={btnGhost}>
                          Archive
                        </button>
                      )}
                      {suggestion.recommended === "unsubscribe" &&
                        sel.unsub?.available && (
                          <button onClick={doUnsubscribe} style={btnGhost}>
                            Unsubscribe
                          </button>
                        )}
                    </>
                  )}
                </div>
              )}

              {replyOpen && (
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: 18,
                    background: "var(--surface)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Reply to {senderName(sel)}
                    </span>
                    <button
                      onClick={suggestReply}
                      disabled={suggesting}
                      style={{
                        ...btnGhost,
                        padding: "5px 11px",
                        fontSize: 12,
                        color: "var(--accent)",
                      }}
                    >
                      {suggesting ? "Drafting…" : "✨ Suggest reply"}
                    </button>
                  </div>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your reply, or let Claude suggest one…"
                    style={textareaStyle}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      onClick={sendReply}
                      disabled={busy !== null || !replyText.trim()}
                      style={btnAccent(busy !== null || !replyText.trim())}
                    >
                      {busy === "reply" ? "Sending…" : "Send reply"}
                    </button>
                    <button onClick={() => setReplyOpen(false)} style={btnGhost}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Message body (sandboxed) */}
              <iframe
                title="message"
                sandbox=""
                srcDoc={bodyHtml}
                style={{
                  width: "100%",
                  height: 460,
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "#fff",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Compose modal */}
      {composeOpen && (
        <div style={overlay} onClick={() => setComposeOpen(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 14,
                color: "var(--text-primary)",
              }}
            >
              New message
            </div>
            <input
              value={cTo}
              onChange={(e) => setCTo(e.target.value)}
              placeholder="To (comma-separated)"
              style={inputStyle}
            />
            <input
              value={cSubject}
              onChange={(e) => setCSubject(e.target.value)}
              placeholder="Subject"
              style={inputStyle}
            />
            <textarea
              value={cBody}
              onChange={(e) => setCBody(e.target.value)}
              placeholder="Write your message…"
              style={{ ...textareaStyle, height: 200 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={sendCompose}
                disabled={busy === "send"}
                style={btnAccent(busy === "send")}
              >
                {busy === "send" ? "Sending…" : "Send"}
              </button>
              <button onClick={() => setComposeOpen(false)} style={btnGhost}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--text-primary)",
            color: "var(--bg)",
            padding: "10px 18px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export default function Inbox() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "var(--text-muted)" }}>Loading…</div>}>
      <InboxInner />
    </Suspense>
  );
}

const btnGhost: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};
function btnAccent(disabled: boolean): React.CSSProperties {
  return {
    padding: "7px 16px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "default" : "pointer",
    background: disabled ? "var(--surface-2)" : "var(--accent)",
    color: disabled ? "var(--text-muted)" : "#fff",
    border: "none",
  };
}
const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 110,
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 10,
  fontSize: 13,
  color: "var(--text-primary)",
  fontFamily: "inherit",
  resize: "vertical",
  boxSizing: "border-box",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "9px 10px",
  fontSize: 13,
  color: "var(--text-primary)",
  marginBottom: 10,
  boxSizing: "border-box",
};
const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 40,
};
const modal: React.CSSProperties = {
  width: 560,
  maxWidth: "92vw",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 22,
};
