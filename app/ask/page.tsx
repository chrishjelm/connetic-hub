"use client";

import { useEffect, useRef, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = { role: "user" | "assistant"; content: any };
type Proposal =
  | { kind: "reply"; message_id: string; to?: string; subject?: string; body: string }
  | { kind: "email"; to: string; subject: string; body: string }
  | { kind: "meeting"; subject: string; start: string; end: string; attendees: string; online: boolean; body: string };

type Turn = {
  who: "you" | "assistant";
  text: string;
  proposal?: Proposal | null;
  proposalDone?: "sent" | "cancelled" | null;
};

export default function AskPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convoRef = useRef<Msg[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<number, string>>({});
  // per-turn field overrides for meeting proposals
  const [fieldEdits, setFieldEdits] = useState<Record<number, Record<string, string>>>({});

  // Seed from a ?q= passed by the home bar
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setTurns((t) => [...t, { who: "you", text }]);
    setBusy(true);
    convoRef.current.push({ role: "user", content: text });
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: convoRef.current }),
      });
      const d = await r.json();
      if (d.success) {
        convoRef.current = d.messages || convoRef.current;
        setTurns((t) => [
          ...t,
          { who: "assistant", text: d.reply || "(done)", proposal: d.proposal || null, proposalDone: null },
        ]);
      } else {
        setTurns((t) => [...t, { who: "assistant", text: `Error: ${d.error}` }]);
      }
    } catch (e) {
      setTurns((t) => [...t, { who: "assistant", text: String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  async function approve(turnIdx: number, proposal: Proposal) {
    const edited = draftEdits[turnIdx];
    let final: Proposal = edited !== undefined ? ({ ...proposal, body: edited } as Proposal) : proposal;
    if (proposal.kind === "meeting") {
      final = { ...proposal, ...(fieldEdits[turnIdx] || {}) } as Proposal;
    }
    const isMeeting = proposal.kind === "meeting";
    setBusy(true);
    try {
      const r = await fetch("/api/agent-act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: final }),
      });
      const d = await r.json();
      setTurns((t) =>
        t.map((turn, i) =>
          i === turnIdx
            ? {
                ...turn,
                proposalDone: d.success ? "sent" : null,
                text: d.success
                  ? turn.text + (isMeeting && d.joinUrl ? `\n\nTeams link: ${d.joinUrl}` : "")
                  : `${turn.text}\n\n${isMeeting ? "Scheduling" : "Send"} failed: ${d.error}`,
              }
            : turn
        )
      );
    } finally {
      setBusy(false);
    }
  }

  function cancel(turnIdx: number) {
    setTurns((t) => t.map((turn, i) => (i === turnIdx ? { ...turn, proposalDone: "cancelled" } : turn)));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: "24px 36px 12px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Command center</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Ask about your mail, calendar, or docs — or tell me to draft something. I&apos;ll show actions for your approval.
        </p>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "8px 36px" }}>
        {turns.length === 0 && !busy && (
          <div style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 12 }}>
            <div style={{ marginBottom: 10 }}>Try:</div>
            {["What does my day look like?", "Summarize the Abra investor update", "Draft a reply to Brad Zapp", "Any emails I haven't replied to?"].map((s) => (
              <button key={s} onClick={() => send(s)} style={suggestion}>{s}</button>
            ))}
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} style={{ marginBottom: 18 }}>
            {turn.who === "you" ? (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={bubbleYou}>{turn.text}</div>
              </div>
            ) : (
              <div>
                <div style={bubbleAssistant}>{turn.text}</div>
                {turn.proposal && (
                  <div style={proposalCard}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--accent)", fontWeight: 600, marginBottom: 8 }}>
                      {turn.proposal.kind === "reply" ? "Proposed reply" : turn.proposal.kind === "meeting" ? "Proposed meeting" : "Proposed email"}
                      {turn.proposalDone === "sent" && <span style={{ color: "var(--green)", marginLeft: 8 }}>✓ {turn.proposal.kind === "meeting" ? "Scheduled" : "Sent"}</span>}
                      {turn.proposalDone === "cancelled" && <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>Cancelled</span>}
                    </div>

                    {turn.proposal.kind === "meeting" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <MeetingField label="Title" value={turn.proposal.subject} field="subject" turn={i} done={turn.proposalDone} set={setFieldEdits} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <MeetingField label="Start" value={turn.proposal.start} field="start" turn={i} done={turn.proposalDone} set={setFieldEdits} />
                          <MeetingField label="End" value={turn.proposal.end} field="end" turn={i} done={turn.proposalDone} set={setFieldEdits} />
                        </div>
                        <MeetingField label="Attendees" value={turn.proposal.attendees} field="attendees" turn={i} done={turn.proposalDone} set={setFieldEdits} />
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {turn.proposal.online ? "Microsoft Teams meeting — a join link will be created" : "No online meeting"}
                        </div>
                      </div>
                    ) : (
                      <>
                        {turn.proposal.kind === "email" && (
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                            To: {turn.proposal.to} · {turn.proposal.subject}
                          </div>
                        )}
                        <textarea
                          defaultValue={turn.proposal.body}
                          onChange={(e) => setDraftEdits((d) => ({ ...d, [i]: e.target.value }))}
                          disabled={turn.proposalDone === "sent"}
                          style={{
                            width: "100%", minHeight: 120, resize: "vertical",
                            background: "var(--surface-2)", color: "var(--text-primary)",
                            border: "1px solid var(--border)", borderRadius: 8, padding: 12,
                            fontSize: 13, fontFamily: "inherit", lineHeight: 1.5,
                          }}
                        />
                      </>
                    )}

                    {!turn.proposalDone && (
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button onClick={() => approve(i, turn.proposal!)} disabled={busy} style={btnAccent}>
                          {turn.proposal.kind === "meeting" ? "Approve & schedule" : "Approve & send"}
                        </button>
                        <button onClick={() => cancel(i)} disabled={busy} style={btnGhost}>Cancel</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {busy && <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "4px 0" }}>Working…</div>}
        <div ref={endRef} />
      </div>

      <div style={{ padding: "12px 36px 24px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
            placeholder="Ask or tell me to do something…"
            style={{
              flex: 1, padding: "12px 16px", borderRadius: 10, fontSize: 14,
              background: "var(--surface-2)", color: "var(--text-primary)",
              border: "1px solid var(--border)", outline: "none",
            }}
          />
          <button onClick={() => send(input)} disabled={busy} style={btnAccent}>Send</button>
        </div>
      </div>
    </div>
  );
}

function MeetingField({
  label, value, field, turn, done, set,
}: {
  label: string;
  value: string;
  field: string;
  turn: number;
  done?: "sent" | "cancelled" | null;
  set: React.Dispatch<React.SetStateAction<Record<number, Record<string, string>>>>;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
      <input
        defaultValue={value}
        disabled={done === "sent"}
        onChange={(e) =>
          set((prev) => ({ ...prev, [turn]: { ...(prev[turn] || {}), [field]: e.target.value } }))
        }
        style={{
          padding: "8px 10px", borderRadius: 7, fontSize: 13,
          background: "var(--surface-2)", color: "var(--text-primary)",
          border: "1px solid var(--border)", outline: "none", width: "100%",
        }}
      />
    </label>
  );
}

const bubbleYou: React.CSSProperties = {
  background: "var(--accent)", color: "#fff", padding: "10px 14px",
  borderRadius: "12px 12px 2px 12px", fontSize: 14, maxWidth: "75%", lineHeight: 1.5,
};
const bubbleAssistant: React.CSSProperties = {
  background: "var(--surface)", color: "var(--text-primary)", padding: "12px 16px",
  borderRadius: "12px 12px 12px 2px", fontSize: 14, maxWidth: "80%", lineHeight: 1.6,
  border: "1px solid var(--border)", whiteSpace: "pre-wrap",
};
const proposalCard: React.CSSProperties = {
  marginTop: 10, maxWidth: "80%", background: "var(--surface)",
  border: "1px solid var(--accent-dim)", borderRadius: 12, padding: 16,
};
const btnAccent: React.CSSProperties = {
  padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
  cursor: "pointer", background: "var(--accent)", color: "#fff", border: "none",
};
const btnGhost: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
  cursor: "pointer", background: "var(--surface-2)", color: "var(--text-primary)",
  border: "1px solid var(--border)",
};
const suggestion: React.CSSProperties = {
  display: "block", textAlign: "left", marginBottom: 8, padding: "9px 14px",
  borderRadius: 8, fontSize: 13, cursor: "pointer", background: "var(--surface)",
  color: "var(--text-secondary)", border: "1px solid var(--border)", width: "fit-content",
};
