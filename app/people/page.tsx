"use client";

import { useEffect, useState } from "react";

type Person = {
  id: number;
  email: string;
  name: string | null;
  role: string | null;
  notes: string;
};

const empty = { email: "", name: "", role: "", notes: "" };

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    fetch("/api/people")
      .then((r) => r.json())
      .then((d) => setPeople(d.success ? d.people : []))
      .catch(() => setPeople([]));
  }
  useEffect(load, []);

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 2200);
  }

  async function save() {
    if (!form.email.trim()) {
      flash("Email is required");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.success) {
        flash("Saved");
        setForm(empty);
        setEditing(null);
        load();
      } else flash(d.error || "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    await fetch(`/api/people?id=${id}`, { method: "DELETE" });
    load();
  }

  function edit(p: Person) {
    setForm({ email: p.email, name: p.name || "", role: p.role || "", notes: p.notes || "" });
    setEditing(p.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div style={{ padding: "32px 36px", maxWidth: 820 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
        People
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
        Notes here teach the assistant how to write to each person — tone, history, what they care about.
        Drafts and replies use this automatically.
      </p>

      <div style={{ ...card, padding: 20, marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "var(--text-primary)" }}>
          {editing ? "Edit person" : "Add a person"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <input
            placeholder="Email (required)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={input}
            disabled={!!editing}
          />
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={input}
          />
        </div>
        <input
          placeholder="Role (e.g. client, investor, colleague)"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          style={{ ...input, marginBottom: 12, width: "100%" }}
        />
        <textarea
          placeholder="Context — e.g. 'Prefers short, direct replies. Cares about timelines. We're mid-negotiation on the Q3 contract.'"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          style={{ ...input, width: "100%", minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button onClick={save} disabled={saving} style={btnAccent}>
            {saving ? "Saving…" : editing ? "Update" : "Add person"}
          </button>
          {editing && (
            <button onClick={() => { setForm(empty); setEditing(null); }} style={btnGhost}>
              Cancel
            </button>
          )}
          {msg && <span style={{ alignSelf: "center", fontSize: 13, color: "var(--text-secondary)" }}>{msg}</span>}
        </div>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        {!people && <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>}
        {people && people.length === 0 && (
          <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>
            No people yet. Add your key contacts above.
          </div>
        )}
        {people?.map((p, i) => (
          <div key={p.id} style={{ padding: "14px 20px", borderBottom: i === people.length - 1 ? "none" : "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                  {p.name || p.email}
                  {p.role && <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: 8 }}>{p.role}</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.email}</div>
                {p.notes && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>{p.notes}</div>}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => edit(p)} style={miniBtn}>Edit</button>
                <button onClick={() => remove(p.id)} style={{ ...miniBtn, color: "var(--amber)" }}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
};
const input: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  fontSize: 13,
  background: "var(--surface-2)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  outline: "none",
};
const btnAccent: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  background: "var(--accent)",
  color: "#fff",
  border: "none",
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
