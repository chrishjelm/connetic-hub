"use client";

import { useEffect, useState } from "react";

type QuickLink = { label: string; url: string };

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [vips, setVips] = useState<string[]>([]);
  const [vipInput, setVipInput] = useState("");
  const [priorityNotes, setPriorityNotes] = useState("");
  const [links, setLinks] = useState<QuickLink[]>([]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.settings) {
          setVips(Array.isArray(d.settings.vips) ? d.settings.vips : []);
          setPriorityNotes(d.settings.priority_notes || "");
          setLinks(Array.isArray(d.settings.quick_links) ? d.settings.quick_links : []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  }

  function addVip() {
    const v = vipInput.trim();
    if (!v) return;
    if (!vips.includes(v)) setVips([...vips, v]);
    setVipInput("");
  }

  function removeVip(v: string) {
    setVips(vips.filter((x) => x !== v));
  }

  function updateLink(i: number, field: "label" | "url", value: string) {
    setLinks(links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }

  function addLink() {
    setLinks([...links, { label: "", url: "" }]);
  }

  function removeLink(i: number) {
    setLinks(links.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vips,
          priority_notes: priorityNotes,
          quick_links: links.filter((l) => l.label.trim() && l.url.trim()),
        }),
      });
      const d = await r.json();
      if (d.success) {
        if (d.settings) {
          setVips(Array.isArray(d.settings.vips) ? d.settings.vips : []);
          setPriorityNotes(d.settings.priority_notes || "");
          setLinks(Array.isArray(d.settings.quick_links) ? d.settings.quick_links : []);
        }
        flash("Saved ✓");
      } else {
        flash(d.error || "Save failed");
      }
    } catch {
      flash("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "32px 36px", maxWidth: 760 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Settings</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
        These tune what your home screen surfaces and how it ranks what needs you.
      </p>

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading…</div>
      ) : (
        <>
          {/* VIPs */}
          <section style={{ ...card, padding: 20, marginBottom: 18 }}>
            <h2 style={sectionH}>VIPs</h2>
            <p style={hint}>
              People whose emails should always float to the top — names or email addresses. Add anyone you never want to miss (key LPs, founders, partners).
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={vipInput}
                onChange={(e) => setVipInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVip(); } }}
                placeholder="e.g. Matt Bell  or  matt@firm.com"
                style={{ ...input, flex: 1 }}
              />
              <button onClick={addVip} style={btnAccent}>Add</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {vips.length === 0 && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>No VIPs yet.</span>}
              {vips.map((v) => (
                <span key={v} style={chip}>
                  {v}
                  <button onClick={() => removeVip(v)} style={chipX} aria-label={`Remove ${v}`}>×</button>
                </span>
              ))}
            </div>
          </section>

          {/* Priority notes */}
          <section style={{ ...card, padding: 20, marginBottom: 18 }}>
            <h2 style={sectionH}>Priority notes</h2>
            <p style={hint}>
              Plain-language standing priorities. The assistant reads these when deciding what matters. e.g. &ldquo;Closing the VCAFX raise — anything from LPs or about wires is urgent. I&rsquo;m evaluating two startups this month.&rdquo;
            </p>
            <textarea
              value={priorityNotes}
              onChange={(e) => setPriorityNotes(e.target.value)}
              placeholder="What matters most to you right now…"
              style={{ ...input, width: "100%", minHeight: 110, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
            />
          </section>

          {/* Quick links */}
          <section style={{ ...card, padding: 20, marginBottom: 18 }}>
            <h2 style={sectionH}>Quick links</h2>
            <p style={hint}>Shortcut buttons shown on your home screen.</p>
            {links.map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  value={l.label}
                  onChange={(e) => updateLink(i, "label", e.target.value)}
                  placeholder="Label"
                  style={{ ...input, width: 180 }}
                />
                <input
                  value={l.url}
                  onChange={(e) => updateLink(i, "url", e.target.value)}
                  placeholder="https://…"
                  style={{ ...input, flex: 1 }}
                />
                <button onClick={() => removeLink(i)} style={{ ...miniBtn, color: "var(--amber)" }}>×</button>
              </div>
            ))}
            <button onClick={addLink} style={btnGhost}>+ Add link</button>
          </section>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button onClick={save} disabled={saving} style={btnAccent}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg.includes("✓") ? "var(--green)" : "var(--amber)" }}>{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 };
const sectionH: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 };
const hint: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 };
const input: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  fontSize: 13,
  background: "var(--surface-2)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  outline: "none",
};
const chip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 6px 5px 12px",
  borderRadius: 20,
  fontSize: 13,
  background: "var(--accent-dim)",
  color: "var(--accent)",
  border: "1px solid var(--accent)",
};
const chipX: React.CSSProperties = {
  cursor: "pointer",
  background: "transparent",
  border: "none",
  color: "var(--accent)",
  fontSize: 16,
  lineHeight: 1,
  padding: "0 2px",
};
const btnAccent: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  background: "var(--accent)",
  color: "#fff",
  border: "none",
};
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
const miniBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: 14,
  cursor: "pointer",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  border: "1px solid var(--border)",
  flexShrink: 0,
};
