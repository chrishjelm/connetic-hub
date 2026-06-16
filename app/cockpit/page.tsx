"use client";

// app/cockpit/page.tsx
// Command-central cockpit: Meeting Prep, Follow-ups, and Scheduling.
// Self-contained so it works regardless of your nav setup — drop a link to
// /cockpit anywhere (or fold these panels into your existing home screen).

import { useEffect, useState } from "react";

type Tab = "prep" | "followups" | "schedule";

const fmt = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

const card: React.CSSProperties = {
  background: "var(--card, #fff)",
  border: "1px solid var(--border, #e5e7eb)",
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
};
const muted: React.CSSProperties = { color: "var(--text-muted, #6b7280)" };
const btn: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  border: "1px solid var(--border, #e5e7eb)",
  background: "var(--accent, #2563eb)",
  color: "#fff",
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  ...btn,
  background: "transparent",
  color: "var(--text, #111827)",
};
const badge: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  background: "var(--accent-soft, #eff6ff)",
  color: "var(--accent, #2563eb)",
};

function NotConfigured() {
  return (
    <div style={{ ...card, ...muted }}>
      Microsoft Graph isn&apos;t connected yet. Add{" "}
      <code>MS_TENANT_ID</code>, <code>MS_CLIENT_ID</code>,{" "}
      <code>MS_CLIENT_SECRET</code> and <code>MS_REFRESH_TOKEN</code> in Vercel,
      then reload. The panels light up automatically once it can reach your
      calendar and mail.
    </div>
  );
}

/* ----------------------------- Meeting Prep ----------------------------- */
function Prep() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/meetings?days=2")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div style={{ ...card, color: "#b91c1c" }}>Couldn&apos;t load meetings: {err}</div>;
  if (!data) return <div style={muted}>Reading your next two days…</div>;
  if (data.configured === false) return <NotConfigured />;
  if (!data.meetings?.length)
    return <div style={{ ...card, ...muted }}>Nothing on the calendar that needs prep in the next two days. Enjoy the quiet.</div>;

  return (
    <div>
      {data.meetings.map((m: any) => (
        <div key={m.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <strong style={{ fontSize: 15 }}>{m.subject}</strong>
            <span style={{ ...muted, fontSize: 12, whiteSpace: "nowrap" }}>{fmt(m.start)}</span>
          </div>
          <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>
            {m.attendees?.join(", ")}
            {m.location ? ` · ${m.location}` : ""}
          </div>

          {m.brief?.length > 0 && (
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>
              {m.brief.map((b: string, i: number) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}

          {m.recent?.length > 0 && (
            <div style={{ ...muted, fontSize: 12, marginTop: 10 }}>
              Recent threads: {m.recent.map((r: any) => r.subject).filter(Boolean).slice(0, 3).join(" · ")}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {m.joinUrl && (
              <a href={m.joinUrl} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none" }}>
                Join Teams
              </a>
            )}
            {m.webLink && (
              <a href={m.webLink} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: "none" }}>
                Open in Outlook
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- Follow-ups ------------------------------- */
function FollowUps() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>("");

  useEffect(() => {
    fetch("/api/followups?days=10")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  async function draftNudge(item: any) {
    setBusy(item.id);
    try {
      const r = await fetch("/api/followups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: item.subject,
          to: item.to?.join(", "),
          sentDate: item.sentDate,
          preview: item.preview,
        }),
      });
      const j = await r.json();
      setDrafts((d) => ({ ...d, [item.id]: j.draft }));
    } finally {
      setBusy("");
    }
  }

  if (err) return <div style={{ ...card, color: "#b91c1c" }}>Couldn&apos;t load follow-ups: {err}</div>;
  if (!data) return <div style={muted}>Checking what&apos;s waiting on a reply…</div>;
  if (data.configured === false) return <NotConfigured />;
  if (!data.items?.length)
    return <div style={{ ...card, ...muted }}>Inbox karma is clean — nothing you sent in the last 10 days is still waiting.</div>;

  return (
    <div>
      {data.items.map((it: any) => (
        <div key={it.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <strong style={{ fontSize: 15 }}>{it.subject}</strong>
            <span style={badge}>{it.waitingDays === 0 ? "today" : `${it.waitingDays}d waiting`}</span>
          </div>
          <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>
            To {it.to?.join(", ")} · sent {fmt(it.sentDate)}
          </div>
          {it.preview && <div style={{ fontSize: 13, marginTop: 8 }}>{it.preview}…</div>}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={btn} disabled={busy === it.id} onClick={() => draftNudge(it)}>
              {busy === it.id ? "Drafting…" : "Draft a nudge"}
            </button>
            <a
              href={`https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(
                (it.toEmails || []).join(";")
              )}&subject=${encodeURIComponent("Re: " + it.subject)}`}
              target="_blank"
              rel="noreferrer"
              style={{ ...btnGhost, textDecoration: "none" }}
            >
              Open in Outlook
            </a>
          </div>

          {drafts[it.id] && (
            <div style={{ marginTop: 12 }}>
              <textarea
                readOnly
                value={drafts[it.id]}
                style={{
                  width: "100%",
                  minHeight: 90,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--border, #e5e7eb)",
                  background: "var(--bg, #fafafa)",
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
              />
              <button
                style={{ ...btnGhost, marginTop: 6 }}
                onClick={() => navigator.clipboard?.writeText(drafts[it.id])}
              >
                Copy
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Scheduling ------------------------------ */
function Schedule() {
  const [attendees, setAttendees] = useState("");
  const [subject, setSubject] = useState("");
  const [duration, setDuration] = useState(30);
  const [slots, setSlots] = useState<any[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState<any>(null);

  const emails = () =>
    attendees.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);

  async function suggest() {
    setMsg("");
    setBooked(null);
    setSlots(null);
    if (emails().length === 0) {
      setMsg("Add at least one attendee email.");
      return;
    }
    setBusy(true);
    try {
      const now = new Date();
      const r = await fetch("/api/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "suggest",
          attendees: emails(),
          durationMinutes: duration,
          startISO: new Date(now.getTime() + 3600 * 1000).toISOString(),
          endISO: new Date(now.getTime() + 10 * 24 * 3600 * 1000).toISOString(),
        }),
      });
      const j = await r.json();
      if (j.configured === false) setMsg("Microsoft Graph isn't connected yet.");
      else if (j.error) setMsg(j.error);
      else if (!j.slots?.length) setMsg("No common free slots in the next 10 days — try a shorter duration.");
      else setSlots(j.slots);
    } finally {
      setBusy(false);
    }
  }

  async function book(slot: any) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "book",
          subject: subject || `Meeting with ${emails()[0]}`,
          startISO: slot.start,
          endISO: slot.end,
          attendees: emails(),
        }),
      });
      const j = await r.json();
      if (j.error) setMsg(j.error);
      else setBooked(j);
    } finally {
      setBusy(false);
    }
  }

  const input: React.CSSProperties = {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "1px solid var(--border, #e5e7eb)",
    background: "var(--bg, #fff)",
    fontSize: 14,
    marginTop: 4,
  };

  return (
    <div style={card}>
      <label style={{ fontSize: 13, fontWeight: 600 }}>
        Attendees
        <input
          style={input}
          placeholder="matt@ardlussacapital.com, lmccormack@conneticventures.com"
          value={attendees}
          onChange={(e) => setAttendees(e.target.value)}
        />
      </label>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, flex: 2 }}>
          Title
          <input style={input} placeholder="Quick sync" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
          Minutes
          <select style={input} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[15, 30, 45, 60].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>

      <button style={{ ...btn, marginTop: 14 }} disabled={busy} onClick={suggest}>
        {busy ? "Checking calendars…" : "Find times"}
      </button>

      {msg && <div style={{ ...muted, marginTop: 12 }}>{msg}</div>}

      {booked && (
        <div style={{ ...card, marginTop: 14, borderColor: "var(--accent, #2563eb)" }}>
          Booked. {booked.joinUrl && (
            <a href={booked.joinUrl} target="_blank" rel="noreferrer">Teams link</a>
          )}{" "}
          {booked.webLink && (
            <a href={booked.webLink} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>Open in Outlook</a>
          )}
        </div>
      )}

      {slots && !booked && (
        <div style={{ marginTop: 14 }}>
          {slots.map((s, i) => (
            <div
              key={i}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border, #eee)" }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{fmt(s.start)}</div>
                {typeof s.confidence === "number" && (
                  <div style={{ ...muted, fontSize: 12 }}>{Math.round(s.confidence)}% everyone free</div>
                )}
              </div>
              <button style={btn} disabled={busy} onClick={() => book(s)}>
                Book with Teams
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Shell --------------------------------- */
export default function Cockpit() {
  const [tab, setTab] = useState<Tab>("prep");
  const tabs: { id: Tab; label: string }[] = [
    { id: "prep", label: "Meeting Prep" },
    { id: "followups", label: "Follow-ups" },
    { id: "schedule", label: "Schedule" },
  ];
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Cockpit</h1>
      <p style={{ ...muted, marginTop: 0, marginBottom: 18 }}>
        What&apos;s coming, what&apos;s waiting, and getting time on the calendar.
      </p>
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              ...btnGhost,
              background: tab === t.id ? "var(--accent, #2563eb)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--text, #111827)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "prep" && <Prep />}
      {tab === "followups" && <FollowUps />}
      {tab === "schedule" && <Schedule />}
    </div>
  );
}
