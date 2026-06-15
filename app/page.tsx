"use client";

import { useEffect, useState, useCallback } from "react";

type PMsg = {
  id: string;
  from: string;
  fromName?: string;
  subject: string;
  preview: string;
  receivedDateTime?: string;
  priority: "high" | "medium" | "low" | string;
  reason?: string;
  unsub?: { available: boolean; oneClick: boolean; url: string; mailto: string };
};

const BUCKETS: { key: string; label: string; color: string; blurb: string }[] = [
  { key: "high", label: "High priority", color: "var(--amber)", blurb: "Handle these first" },
  { key: "medium", label: "Medium", color: "var(--blue)", blurb: "Worth a look" },
  { key: "low", label: "Low", color: "var(--text-muted)", blurb: "Noise — clear when you like" },
];

function when(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const [msgs, setMsgs] = useState<PMsg[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(() => {
    setMsgs(null);
    setErr(null);
    fetch("/api/outlook-mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prioritize" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setMsgs(d.messages || []);
        else setErr(d.error || "Could not sort inbox");
      })
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: string, m: PMsg) {
    setBusy(m.id + action);
    try {
      const extra =
        action === "unsubscribe" && m.unsub?.url ? { url: m.unsub.url } : {};
      const r = await fetch("/api/outlook-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: m.id, ...extra }),
      });
      const d = await r.json();
      if (d.success) {
        flash(action === "archive" ? "Archived" : "Unsubscribe sent");
        if (action === "archive")
          setMsgs((p) => (p ? p.filter((x) => x.id !== m.id) : p));
      } else {
        flash(`Failed: ${(d.error || "").slice(0, 60)}`);
      }
    } catch (e) {
      flash(String(e));
    } finally {
      setBusy(null);
    }
  }

  const counts = {
    high: (msgs || []).filter((m) => m.priority === "high").length,
    medium: (msgs || []).filter((m) => m.priority === "medium").length,
    low: (msgs || []).filter((m) => m.priority === "low").length,
  };

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1000 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 26,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 4,
            }}
          >
            Priorities
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            {msgs === null
              ? "Sorting your inbox…"
              : `${counts.high} high · ${counts.medium} medium · ${counts.low} low`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/inbox" style={btnGhostLink}>
            Open inbox
          </a>
          <button onClick={load} style={btnGhost}>
            Re-prioritize
          </button>
        </div>
      </div>

      {err && (
        <div
          style={{
            ...card,
            padding: "16px 20px",
            color: "var(--amber)",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      {msgs === null && !err && (
        <div
          style={{
            ...card,
            padding: "40px 20px",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          ✨ Reading your inbox and ranking by priority…
        </div>
      )}

      {msgs && msgs.length === 0 && (
        <div
          style={{
            ...card,
            padding: "40px 20px",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          Inbox zero. Nothing to triage.
        </div>
      )}

      {msgs &&
        msgs.length > 0 &&
        BUCKETS.map((b) => {
          const items = msgs.filter((m) => m.priority === b.key);
          if (!items.length) return null;
          return (
            <div key={b.key} style={{ marginBottom: 26 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: b.color,
                  }}
                />
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {b.label}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {items.length} · {b.blurb}
                </span>
              </div>

              <div style={{ ...card, overflow: "hidden" }}>
                {items.map((m, i) => (
                  <div
                    key={m.id}
                    style={{
                      padding: "13px 18px",
                      borderBottom:
                        i === items.length - 1
                          ? "none"
                          : "1px solid var(--border)",
                      borderLeft: `3px solid ${b.color}`,
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {m.fromName || m.from}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            flexShrink: 0,
                          }}
                        >
                          {when(m.receivedDateTime)}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {m.subject || "(no subject)"}
                      </div>
                      {m.reason && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-muted)",
                            fontStyle: "italic",
                            marginTop: 2,
                          }}
                        >
                          {m.reason}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => act("archive", m)}
                        disabled={busy !== null}
                        style={miniBtn}
                      >
                        {busy === m.id + "archive" ? "…" : "Archive"}
                      </button>
                      {m.unsub?.available && (
                        <button
                          onClick={() => act("unsubscribe", m)}
                          disabled={busy !== null}
                          style={miniBtn}
                        >
                          {busy === m.id + "unsubscribe" ? "…" : "Unsub"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

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

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
};
const btnGhost: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};
const btnGhostLink: React.CSSProperties = {
  ...btnGhost,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};
const miniBtn: React.CSSProperties = {
  padding: "5px 11px",
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  border: "1px solid var(--border)",
};
