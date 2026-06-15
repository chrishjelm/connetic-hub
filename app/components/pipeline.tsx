"use client";

import { useEffect, useState } from "react";

type Lead = {
  id: number;
  type: string;
  name: string;
  firm: string | null;
  email: string | null;
  stage: string;
  amount: string | null;
  next_step: string | null;
  notes: string;
  last_touch: string | null;
};

const blank = { name: "", firm: "", email: "", stage: "", amount: "", next_step: "", notes: "" };

export default function Pipeline({
  type,
  title,
  subtitle,
  stages,
}: {
  type: "investor" | "startup";
  title: string;
  subtitle: string;
  stages: string[];
}) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [form, setForm] = useState({ ...blank, stage: stages[0] });
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  type Suggestion = { email: string; name: string; type: string; firm: string; reason: string };
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [scanning, setScanning] = useState(false);

  function load() {
    fetch(`/api/leads?type=${type}`)
      .then((r) => r.json())
      .then((d) => setLeads(d.success ? d.leads : []))
      .catch(() => setLeads([]));
  }
  useEffect(load, [type]);

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 2000);
  }

  async function save() {
    if (!form.name.trim()) return flash("Name required");
    const body = editing ? { ...form, id: editing, type } : { ...form, type };
    const r = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.success) {
      flash("Saved");
      setForm({ ...blank, stage: stages[0] });
      setEditing(null);
      setShowForm(false);
      load();
    } else flash(d.error || "Failed");
  }

  async function moveStage(lead: Lead, stage: string) {
    setLeads((ls) => ls?.map((l) => (l.id === lead.id ? { ...l, stage } : l)) || ls);
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lead.id, stage, last_touch: new Date().toISOString() }),
    });
  }

  async function remove(id: number) {
    await fetch(`/api/leads?id=${id}`, { method: "DELETE" });
    load();
  }

  function edit(l: Lead) {
    setForm({
      name: l.name, firm: l.firm || "", email: l.email || "", stage: l.stage,
      amount: l.amount || "", next_step: l.next_step || "", notes: l.notes || "",
    });
    setEditing(l.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function scan() {
    setScanning(true);
    setSuggestions(null);
    try {
      const r = await fetch("/api/lead-suggest");
      const d = await r.json();
      // only show suggestions matching this page's type
      setSuggestions(
        d.success ? (d.suggestions || []).filter((s: Suggestion) => s.type === type) : []
      );
    } catch {
      setSuggestions([]);
    } finally {
      setScanning(false);
    }
  }

  async function accept(s: { email: string; name: string; firm: string; reason: string }) {
    await fetch("/api/lead-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", type, ...s }),
    });
    setSuggestions((ss) => ss?.filter((x) => x.email !== s.email) || ss);
    load();
  }

  async function dismiss(email: string) {
    await fetch("/api/lead-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", email }),
    });
    setSuggestions((ss) => ss?.filter((x) => x.email !== email) || ss);
  }

  return (
    <div style={{ padding: "32px 36px", maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)" }}>{title}</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={scan} disabled={scanning} style={btnGhost}>
            {scanning ? "Scanning…" : "Scan email"}
          </button>
          <button onClick={() => { setShowForm((s) => !s); setEditing(null); setForm({ ...blank, stage: stages[0] }); }} style={btnAccent}>
            {showForm ? "Close" : "+ Add"}
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ ...card, padding: 18, margin: "16px 0 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--text-primary)" }}>
            {editing ? "Edit" : "Add"} {type === "investor" ? "investor" : "startup"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <input placeholder={type === "investor" ? "Name" : "Founder name"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={input} />
            <input placeholder={type === "investor" ? "Firm" : "Company"} value={form.firm} onChange={(e) => setForm({ ...form, firm: e.target.value })} style={input} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={input} />
            <input placeholder={type === "investor" ? "Commitment size" : "Round size"} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={input} />
            <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} style={input}>
              {stages.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input placeholder="Next step" value={form.next_step} onChange={(e) => setForm({ ...form, next_step: e.target.value })} style={input} />
          </div>
          <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...input, width: "100%", minHeight: 70, resize: "vertical", fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
            <button onClick={save} style={btnAccent}>{editing ? "Update" : "Add"}</button>
            {msg && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{msg}</span>}
          </div>
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div style={{ ...card, padding: 16, margin: "16px 0 8px", borderLeft: "3px solid var(--accent)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--accent)", marginBottom: 10 }}>
            Suggested from your email · {suggestions.length}
          </div>
          {suggestions.map((s) => (
            <div key={s.email} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {s.name}{s.firm ? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {s.firm}</span> : null}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.email}</div>
                {s.reason && <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic" }}>{s.reason}</div>}
              </div>
              <button onClick={() => accept(s)} style={miniAccent}>Add</button>
              <button onClick={() => dismiss(s.email)} style={miniBtn}>Dismiss</button>
            </div>
          ))}
        </div>
      )}
      {suggestions && suggestions.length === 0 && !scanning && (
        <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "12px 0" }}>
          No new {type === "investor" ? "investor" : "startup"} candidates found in recent email.
        </div>
      )}

      {!leads && <Muted>Loading…</Muted>}
      {leads && leads.length === 0 && <Muted>No {type === "investor" ? "investors" : "startups"} yet. Add one, or tell the command bar.</Muted>}

      {leads && stages.map((stage) => {
        const items = leads.filter((l) => l.stage === stage);
        if (!items.length) return null;
        return (
          <div key={stage} style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-secondary)", marginBottom: 8 }}>
              {stage} <span style={{ color: "var(--text-muted)" }}>· {items.length}</span>
            </div>
            <div style={{ ...card, overflow: "hidden" }}>
              {items.map((l, i) => (
                <div key={l.id} style={{ padding: "13px 18px", borderBottom: i === items.length - 1 ? "none" : "1px solid var(--border)", display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                      {l.name}{l.firm ? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {l.firm}</span> : null}
                      {l.amount ? <span style={{ fontSize: 12, color: "var(--green)", marginLeft: 8 }}>{l.amount}</span> : null}
                    </div>
                    {l.email && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{l.email}</div>}
                    {l.next_step && <div style={{ fontSize: 12, color: "var(--blue)", marginTop: 3 }}>Next: {l.next_step}</div>}
                    {l.notes && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 }}>{l.notes}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                    <select value={l.stage} onChange={(e) => moveStage(l, e.target.value)} style={{ ...input, padding: "5px 8px", fontSize: 12 }}>
                      {stages.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={() => edit(l)} style={miniBtn}>Edit</button>
                    <button onClick={() => remove(l.id)} style={{ ...miniBtn, color: "var(--amber)" }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "12px 0" }}>{children}</div>;
}

const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 };
const input: React.CSSProperties = {
  padding: "9px 12px", borderRadius: 8, fontSize: 13, background: "var(--surface-2)",
  color: "var(--text-primary)", border: "1px solid var(--border)", outline: "none",
};
const btnAccent: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
  background: "var(--accent)", color: "#fff", border: "none",
};
const miniBtn: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer",
  background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border)",
};
const miniAccent: React.CSSProperties = {
  padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
  background: "var(--accent)", color: "#fff", border: "none",
};
const btnGhost: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
  background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border)",
};
