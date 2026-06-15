"use client";

import { useEffect, useState } from "react";

type Lead = {
  fullname?: string;
  emailaddress1?: string;
  statuscode?: number;
  estimatedvalue?: number;
  createdon?: string;
};

type TriageAction = {
  from: string;
  subject: string;
  category: string;
  urgent: boolean;
  summary: string;
  did: string[];
};

type TriageResult = {
  success: boolean;
  mailbox?: string;
  auto_send?: boolean;
  auto_unsubscribe?: boolean;
  scanned?: number;
  actions?: TriageAction[];
  error?: string;
};

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
};

function money(n?: number): string {
  if (!n || isNaN(n)) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${n}`;
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [leadsError, setLeadsError] = useState<string | null>(null);

  const [running, setRunning] = useState<null | "gmail" | "outlook">(null);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [resultLabel, setResultLabel] = useState<string>("");

  function loadLeads() {
    setLeads(null);
    setLeadsError(null);
    fetch("/api/dynamics?entity=leads")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setLeads(d.data || []);
        else setLeadsError(d.error || "Could not load leads");
      })
      .catch((e) => setLeadsError(String(e)));
  }

  useEffect(() => {
    loadLeads();
  }, []);

  async function runTriage(which: "gmail" | "outlook") {
    setRunning(which);
    setResult(null);
    setResultLabel(which === "gmail" ? "Gmail" : "Outlook");
    try {
      const path = which === "gmail" ? "/api/triage" : "/api/triage-outlook";
      const r = await fetch(path);
      const d = await r.json();
      setResult(d);
    } catch (e) {
      setResult({ success: false, error: String(e) });
    } finally {
      setRunning(null);
    }
  }

  const pipeline = (leads || []).reduce(
    (s, l) => s + (l.estimatedvalue || 0),
    0
  );
  const mode =
    result && result.success
      ? result.auto_send
        ? "Live send"
        : "Draft-only"
      : "Draft-only";

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1100 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 28,
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
            Dashboard
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Live from Dynamics &amp; your inboxes — {today}
          </p>
        </div>
        <button
          onClick={loadLeads}
          style={{
            padding: "9px 18px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            background: "var(--surface-2)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginBottom: 32,
        }}
      >
        <div style={{ ...cardStyle, padding: "20px 22px" }}>
          <div style={statLabel}>Active leads</div>
          <div style={{ ...statNum, color: "var(--accent)" }}>
            {leads === null ? "…" : leads.length}
          </div>
          <div style={statSub}>from Dynamics</div>
        </div>
        <div style={{ ...cardStyle, padding: "20px 22px" }}>
          <div style={statLabel}>Pipeline value</div>
          <div style={{ ...statNum, color: "var(--green)" }}>
            {leads === null ? "…" : money(pipeline)}
          </div>
          <div style={statSub}>estimated, open leads</div>
        </div>
        <div style={{ ...cardStyle, padding: "20px 22px" }}>
          <div style={statLabel}>Triage mode</div>
          <div style={{ ...statNum, color: "var(--blue)", fontSize: 20 }}>
            {mode}
          </div>
          <div style={statSub}>
            {result?.auto_unsubscribe ? "auto-unsub on" : "review mode"}
          </div>
        </div>
        <div style={{ ...cardStyle, padding: "20px 22px" }}>
          <div style={statLabel}>Last run</div>
          <div style={{ ...statNum, color: "var(--amber)" }}>
            {result && result.success ? result.scanned ?? 0 : "—"}
          </div>
          <div style={statSub}>
            {result && result.success
              ? `${resultLabel} scanned`
              : "not run yet"}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 20,
        }}
      >
        {/* Real leads */}
        <div style={{ ...cardStyle, overflow: "hidden" }}>
          <div style={panelHead}>
            <span style={{ fontWeight: 500, fontSize: 14 }}>
              Recent leads
            </span>
            <a href="/leads" style={linkStyle}>
              View all →
            </a>
          </div>

          {leadsError && (
            <div style={{ padding: "16px 20px", color: "var(--amber)", fontSize: 13 }}>
              Couldn&apos;t load leads: {leadsError}
            </div>
          )}
          {leads === null && !leadsError && (
            <div style={{ padding: "16px 20px", color: "var(--text-muted)", fontSize: 13 }}>
              Loading from Dynamics…
            </div>
          )}
          {leads && leads.length === 0 && (
            <div style={{ padding: "16px 20px", color: "var(--text-muted)", fontSize: 13 }}>
              No leads found.
            </div>
          )}
          {leads &&
            leads.slice(0, 8).map((l, i) => (
              <div
                key={i}
                style={{
                  padding: "13px 20px",
                  borderBottom:
                    i === Math.min(leads.length, 8) - 1
                      ? "none"
                      : "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {l.fullname || "(no name)"}
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
                    {l.emailaddress1 || "—"} · {timeAgo(l.createdon)}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--green)",
                    flexShrink: 0,
                    marginLeft: 12,
                  }}
                >
                  {money(l.estimatedvalue)}
                </div>
              </div>
            ))}
        </div>

        {/* Triage controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ ...cardStyle, overflow: "hidden" }}>
            <div style={panelHead}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>
                Triage controls
              </span>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", gap: 10 }}>
              <button
                onClick={() => runTriage("gmail")}
                disabled={running !== null}
                style={btnPrimary(running !== null)}
              >
                {running === "gmail" ? "Running…" : "Run Gmail"}
              </button>
              <button
                onClick={() => runTriage("outlook")}
                disabled={running !== null}
                style={btnPrimary(running !== null)}
              >
                {running === "outlook" ? "Running…" : "Run Outlook"}
              </button>
            </div>
            {running && (
              <div
                style={{
                  padding: "0 20px 16px",
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                Scanning {resultLabel}… this can take up to a couple of minutes.
              </div>
            )}
          </div>

          {/* Results */}
          {result && (
            <div style={{ ...cardStyle, overflow: "hidden" }}>
              <div style={panelHead}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>
                  {resultLabel} result
                </span>
                {result.success && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {result.scanned ?? 0} scanned
                  </span>
                )}
              </div>

              {!result.success && (
                <div style={{ padding: "16px 20px", color: "var(--amber)", fontSize: 13 }}>
                  {result.error || "Run failed."}
                </div>
              )}

              {result.success && (result.actions || []).length === 0 && (
                <div style={{ padding: "16px 20px", color: "var(--text-muted)", fontSize: 13 }}>
                  Nothing new to triage.
                </div>
              )}

              {result.success &&
                (result.actions || []).map((a, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "12px 20px",
                      borderBottom:
                        i === (result.actions || []).length - 1
                          ? "none"
                          : "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {a.subject || "(no subject)"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                      {a.from}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      <span style={tag("var(--accent-dim)", "var(--accent)")}>
                        {a.category}
                      </span>
                      {a.urgent && (
                        <span style={tag("var(--amber-dim, #3a2e00)", "var(--amber)")}>
                          urgent
                        </span>
                      )}
                      {a.did.map((d, j) => (
                        <span
                          key={j}
                          style={tag("var(--surface-2)", "var(--text-secondary)")}
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const statLabel: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-muted)",
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
const statNum: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  lineHeight: 1,
};
const statSub: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
  marginTop: 6,
};
const panelHead: React.CSSProperties = {
  padding: "18px 20px",
  borderBottom: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};
const linkStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--accent)",
  textDecoration: "none",
};

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "9px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "default" : "pointer",
    background: disabled ? "var(--surface-2)" : "var(--accent)",
    color: disabled ? "var(--text-muted)" : "#fff",
    border: "none",
  };
}

function tag(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    fontSize: 10,
    fontWeight: 500,
    padding: "2px 7px",
    borderRadius: 20,
    whiteSpace: "nowrap",
  };
}
