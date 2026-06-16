"use client";

import { useEffect, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Home = any;

function timeOf(iso?: string, allDay?: boolean): string {
  if (!iso) return "";
  if (allDay) return "All day";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const tom = new Date();
  tom.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tom.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export default function HomePage() {
  const [data, setData] = useState<Home | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [followups, setFollowups] = useState<any | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [fuBusy, setFuBusy] = useState<string | null>(null);

  function load() {
    setData(null);
    setErr(null);
    setFollowups(null);
    setRemovedIds(new Set());
    fetch("/api/home")
      .then((r) => r.json())
      .then((d) => (d.success ? setData(d) : setErr(d.error || "Failed to load")))
      .catch((e) => setErr(String(e)));
    fetch("/api/followups")
      .then((r) => r.json())
      .then((d) => setFollowups(d.success ? d : { waiting_on_them: [], waiting_on_you: [] }))
      .catch(() => setFollowups({ waiting_on_them: [], waiting_on_you: [] }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function resolveFu(item: any, action: "done" | "snooze") {
    setFuBusy(item.conversation_id + action);
    try {
      await fetch("/api/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action === "snooze" ? "snooze" : "done",
          days: 3,
          conversation_id: item.conversation_id,
          direction: item.direction,
          counterpart: item.counterpart,
          subject: item.subject,
        }),
      });
      setFollowups((f: typeof followups) => {
        if (!f) return f;
        const filt = (arr: typeof f.waiting_on_them) => arr.filter((x: { conversation_id: string }) => x.conversation_id !== item.conversation_id);
        return { ...f, waiting_on_them: filt(f.waiting_on_them), waiting_on_you: filt(f.waiting_on_you) };
      });
    } finally {
      setFuBusy(null);
    }
  }

  useEffect(load, []);

  function removeId(id: string) {
    setRemovedIds((prev) => new Set([...prev, id]));
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cal: any[] = data?.calendar || [];
  const todayEvents = cal.filter((c) => dayLabel(c.start) === "Today");
  const laterEvents = cal.filter((c) => dayLabel(c.start) !== "Today");

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)" }}>
          {greeting}, Chris
        </h1>
        <button onClick={load} style={btnGhost}>Refresh</button>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18 }}>
        {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = (new FormData(e.currentTarget).get("q") as string)?.trim();
          if (q) window.location.href = `/ask?q=${encodeURIComponent(q)}`;
        }}
        style={{ marginBottom: 24 }}
      >
        <input
          name="q"
          placeholder="Ask or tell me to do something…"
          style={{
            width: "100%", padding: "13px 18px", borderRadius: 10, fontSize: 14,
            background: "var(--surface-2)", color: "var(--text-primary)",
            border: "1px solid var(--border)", outline: "none",
          }}
        />
      </form>

      {err && <div style={{ ...card, padding: 16, color: "var(--amber)", fontSize: 13 }}>{err}</div>}

      <div style={{ ...card, padding: "18px 22px", marginBottom: 22, borderLeft: "3px solid var(--accent)" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--accent)", marginBottom: 8, fontWeight: 600 }}>
          Your brief
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-primary)" }}>
          {data ? (data.brief || "Nothing pressing right now.") : "Putting your day together…"}
        </div>
      </div>

      {data && (
        <div style={{ ...card, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h2 style={sectionH}>What needs you today</h2>
            <a href="/inbox" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>Open inbox →</a>
          </div>
          {(() => {
            const visible = (data.priority || []).filter((m: { id: string }) => !removedIds.has(m.id));
            if (visible.length === 0) return <Muted>Nothing needs you right now. Clear runway.</Muted>;
            return visible.map((m: { id: string; from: string; fromEmail?: string; subject: string; reason?: string; action?: string }, i: number) => (
              <PriorityRow key={m.id} m={m} last={i === visible.length - 1} onRemove={removeId} />
            ));
          })()}
        </div>
      )}

      {data?.quick_links?.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {data.quick_links.map((l: any) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={quickLink}>
              {l.label}
            </a>
          ))}
        </div>
      )}

      {followups && (followups.waiting_on_them.length > 0 || followups.waiting_on_you.length > 0) && (
        <div style={{ ...card, padding: 20, marginBottom: 20, borderLeft: "3px solid var(--amber)" }}>
          <h2 style={sectionH}>Needs follow-up</h2>
          {followups.waiting_on_them.length > 0 && (
            <div style={{ marginBottom: followups.waiting_on_you.length ? 14 : 0 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Waiting on them</div>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {followups.waiting_on_them.map((f: any, i: number) => (
                <FollowupRow key={f.conversation_id} f={f} last={i === followups.waiting_on_them.length - 1} busy={fuBusy} onResolve={resolveFu} nudge />
              ))}
            </div>
          )}
          {followups.waiting_on_you.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Waiting on you</div>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {followups.waiting_on_you.map((f: any, i: number) => (
                <FollowupRow key={f.conversation_id} f={f} last={i === followups.waiting_on_you.length - 1} busy={fuBusy} onResolve={resolveFu} />
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <section style={{ ...card, padding: 20 }}>
          <h2 style={sectionH}>Today</h2>
          {!data && <Muted>Loading…</Muted>}
          {data && todayEvents.length === 0 && <Muted>No meetings today.</Muted>}
          {todayEvents.map((e, i) => (
            <div key={i} style={rowStyle(i === todayEvents.length - 1)}>
              <div style={{ width: 62, flexShrink: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                {timeOf(e.start, e.allDay)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{e.subject}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {e.online ? "Teams" : e.location || ""}
                  {e.attendees?.length ? ` · ${e.attendees.join(", ")}` : ""}
                </div>
              </div>
            </div>
          ))}
          {laterEvents.length > 0 && (
            <>
              <h2 style={{ ...sectionH, marginTop: 18 }}>Coming up</h2>
              {laterEvents.map((e, i) => (
                <div key={i} style={rowStyle(i === laterEvents.length - 1)}>
                  <div style={{ width: 86, flexShrink: 0, fontSize: 11, color: "var(--text-secondary)" }}>
                    {dayLabel(e.start)} {timeOf(e.start, e.allDay)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{e.subject}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </section>

        <section style={{ ...card, padding: 20 }}>
          <h2 style={sectionH}>Recent documents</h2>
          {!data && <Muted>Loading…</Muted>}
          {data && data.docs?.length === 0 && <Muted>No recent files.</Muted>}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {data?.docs?.map((f: any, i: number) => (
            <a key={i} href={f.url} target="_blank" rel="noreferrer" style={{ ...rowStyle(i === data.docs.length - 1), textDecoration: "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{dayLabel(f.modified)}</div>
              </div>
            </a>
          ))}
        </section>

        <section style={{ ...card, padding: 20 }}>
          <h2 style={sectionH}>You recently sent</h2>
          {!data && <Muted>Loading…</Muted>}
          {data && data.sent?.length === 0 && <Muted>Nothing sent recently.</Muted>}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {data?.sent?.map((m: any, i: number) => (
            <div key={i} style={rowStyle(i === data.sent.length - 1)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.subject || "(no subject)"}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>to {m.to} · {dayLabel(m.sent)}</div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function FollowupRow({
  f, last, busy, onResolve, nudge,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  f: any;
  last: boolean;
  busy: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onResolve: (f: any, action: "done" | "snooze") => void;
  nudge?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: last ? "none" : "1px solid var(--border)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {f.counterpart}
          <span style={{ fontSize: 11, fontWeight: 400, color: "var(--amber)", marginLeft: 8 }}>{f.days}d</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.subject}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {nudge && (
          <a
            href={`/ask?q=${encodeURIComponent(`Draft a follow-up to ${f.counterpart} about "${f.subject}" — I haven't heard back.`)}`}
            style={fuBtnAccent}
          >
            Nudge
          </a>
        )}
        <button onClick={() => onResolve(f, "done")} disabled={!!busy} style={fuBtn}>Done</button>
        <button onClick={() => onResolve(f, "snooze")} disabled={!!busy} style={fuBtn}>Snooze</button>
      </div>
    </div>
  );
}

function PriorityRow({ m, last, onRemove }: {
  m: { id: string; from: string; fromEmail?: string; subject: string; reason?: string; action?: string };
  last: boolean;
  onRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [voted, setVoted] = useState<number | null>(null);
  const action = m.action || "review";
  const badge =
    action === "reply"
      ? { label: "Reply", bg: "var(--accent-dim)", fg: "var(--accent)", border: "var(--accent)" }
      : action === "fyi"
      ? { label: "FYI", bg: "var(--surface-2)", fg: "var(--text-muted)", border: "var(--border)" }
      : { label: "Review", bg: "var(--surface-2)", fg: "var(--amber)", border: "var(--amber)" };

  async function act(a: string) {
    setBusy(a);
    try {
      await fetch("/api/priority-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: a, messageId: m.id, fromEmail: m.fromEmail, fromName: m.from, subject: m.subject }),
      });
      onRemove(m.id);
    } finally {
      setBusy(null);
    }
  }

  async function thumb(vote: number) {
    setVoted(vote);
    await fetch("/api/priority-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "feedback", messageId: m.id, fromEmail: m.fromEmail, fromName: m.from, subject: m.subject, vote }),
    }).catch(() => {});
    // Thumbs down also removes from list
    if (vote === -1) setTimeout(() => onRemove(m.id), 400);
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "13px 0", borderBottom: last ? "none" : "1px solid var(--border)" }}>
      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: badge.fg, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 5, padding: "3px 7px", marginTop: 2 }}>
        {badge.label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {m.from}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {m.subject}
        </div>
        {m.reason && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{m.reason}</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <a
            href={`/ask?q=${encodeURIComponent(`Draft a reply to ${m.from} about "${m.subject}".`)}`}
            style={actionBtn}
          >
            ✦ Draft reply
          </a>
          <a
            href={`/inbox?id=${m.id}`}
            style={actionBtn}
          >
            Open
          </a>
          <button onClick={() => act("archive")} disabled={!!busy} style={actionBtn}>
            {busy === "archive" ? "…" : "Archive"}
          </button>
          <button onClick={() => act("markRead")} disabled={!!busy} style={{ ...actionBtn, color: "var(--text-muted)" }}>
            {busy === "markRead" ? "…" : "Done"}
          </button>
          {/* thumbs */}
          <button
            onClick={() => thumb(1)}
            disabled={voted !== null}
            title="Useful — keep surfacing this"
            style={{ ...actionBtn, color: voted === 1 ? "var(--green)" : "var(--text-muted)", fontSize: 14 }}
          >👍</button>
          <button
            onClick={() => thumb(-1)}
            disabled={voted !== null}
            title="Not useful — stop surfacing this sender"
            style={{ ...actionBtn, color: voted === -1 ? "var(--amber)" : "var(--text-muted)", fontSize: 14 }}
          >👎</button>
        </div>
      </div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>{children}</div>;
}

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
};
const sectionH: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-primary)",
  marginBottom: 10,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};
function rowStyle(last: boolean): React.CSSProperties {
  return {
    display: "flex",
    gap: 12,
    alignItems: "center",
    padding: "10px 0",
    borderBottom: last ? "none" : "1px solid var(--border)",
  };
}
const btnGhost: React.CSSProperties = {
  padding: "8px 15px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};
const quickLink: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  background: "var(--surface-2)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  textDecoration: "none",
};

const fuBtn: React.CSSProperties = {
  padding: "5px 11px",
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  border: "1px solid var(--border)",
};
const fuBtnAccent: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 600,
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};
const actionBtn: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  border: "1px solid var(--border)",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};
