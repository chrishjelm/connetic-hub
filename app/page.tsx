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

  function load() {
    setData(null);
    setErr(null);
    fetch("/api/home")
      .then((r) => r.json())
      .then((d) => (d.success ? setData(d) : setErr(d.error || "Failed to load")))
      .catch((e) => setErr(String(e)));
  }

  useEffect(load, []);

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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={sectionH}>What needs you</h2>
            <a href="/inbox" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>Inbox →</a>
          </div>
          {!data && <Muted>Loading…</Muted>}
          {data && data.priority?.length === 0 && <Muted>Nothing urgent. Nice.</Muted>}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {data?.priority?.map((m: any, i: number) => (
            <div key={m.id} style={rowStyle(i === data.priority.length - 1)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {m.from}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {m.subject}
                </div>
                {m.reason && <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>{m.reason}</div>}
              </div>
            </div>
          ))}
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
