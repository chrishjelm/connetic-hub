"use client";
import { useEffect, useState } from "react";
import { Video, Users, Clock, CheckCircle2, XCircle, ExternalLink } from "lucide-react";

interface CalEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  isOnline: boolean;
  joinUrl: string | null;
  attendees: { name: string; email: string; status: string }[];
  showAs: string;
  myStatus: string;
}

function fmt(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtDay(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  const today = new Date();
  const diff = Math.floor((d.setHours(0,0,0,0) - today.setHours(0,0,0,0)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function duration(start: string, end: string) {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function groupByDay(events: CalEvent[]) {
  const groups: Record<string, CalEvent[]> = {};
  for (const e of events) {
    const key = fmtDay(e.start);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return groups;
}

export default function Scheduling() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(end.getDate() + 14);

    fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "list",
        startISO: start.toISOString(),
        endISO: end.toISOString(),
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.configured === false) {
          setNotConfigured(true);
        } else if (d.error) {
          setError(d.error);
        } else {
          setEvents(d.events || []);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const grouped = groupByDay(events);

  return (
    <div style={{ padding: "32px 36px", maxWidth: 860 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Scheduling
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          Next 14 days · synced from Outlook
        </p>
      </div>

      {loading && (
        <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "40px 0", textAlign: "center" }}>
          Loading your calendar…
        </div>
      )}

      {notConfigured && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "24px 28px", color: "var(--text-secondary)", fontSize: 14,
        }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>Outlook not connected</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Add <code>OUTLOOK_REFRESH_TOKEN</code>, <code>AZURE_CLIENT_ID</code>, and{" "}
            <code>AZURE_CLIENT_SECRET</code> to your Vercel environment variables to sync your calendar.
          </div>
        </div>
      )}

      {error && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "20px 24px", color: "var(--text-secondary)", fontSize: 13,
        }}>
          Error loading calendar: {error}
        </div>
      )}

      {!loading && !error && !notConfigured && events.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "40px 0", textAlign: "center" }}>
          No meetings in the next 14 days.
        </div>
      )}

      {!loading && !error && !notConfigured && Object.entries(grouped).map(([day, dayEvents]) => (
        <div key={day} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
            {day}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dayEvents.map((e) => {
              const declined = e.myStatus === "declined";
              return (
                <div key={e.id} style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderLeft: `3px solid ${declined ? "var(--border)" : e.isOnline ? "var(--accent)" : "var(--text-muted)"}`,
                  borderRadius: 10,
                  padding: "14px 18px",
                  opacity: declined ? 0.5 : 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                      {e.subject}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                      {e.isOnline && e.joinUrl && (
                        <a href={e.joinUrl} target="_blank" rel="noreferrer" style={{
                          display: "flex", alignItems: "center", gap: 4,
                          fontSize: 12, color: "var(--accent)", textDecoration: "none",
                        }}>
                          <Video size={12} /> Join
                          <ExternalLink size={10} />
                        </a>
                      )}
                      {e.isOnline && !e.joinUrl && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                          <Video size={12} /> Teams
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "var(--text-muted)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={11} />
                      {fmt(e.start)} – {fmt(e.end)} · {duration(e.start, e.end)}
                    </div>
                    {e.attendees.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Users size={11} />
                        {e.attendees.length === 1
                          ? e.attendees[0].name
                          : `${e.attendees[0].name} +${e.attendees.length - 1}`}
                      </div>
                    )}
                    {declined && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-muted)" }}>
                        <XCircle size={11} /> Declined
                      </div>
                    )}
                    {e.myStatus === "accepted" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--green)" }}>
                        <CheckCircle2 size={11} /> Accepted
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
