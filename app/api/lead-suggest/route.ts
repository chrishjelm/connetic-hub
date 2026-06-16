import { NextResponse } from "next/server";
import { graphToken, gh, GRAPH } from "@/lib/graph";
import { sbSelect, sbInsert, sbUpdate } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function askClaude(prompt: string, maxTokens: number): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const d = await r.json();
  return (d.content || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((x: any) => x.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((x: any) => x.text)
    .join("")
    .trim();
}

// GET: scan recent mail, return candidate leads (not yet added/dismissed).
export async function GET() {
  try {
    const token = await graphToken();

    // Pull recent inbox + sent so we catch both directions of a thread
    const [inboxR, sentR] = await Promise.all([
      fetch(
        `${GRAPH}/mailFolders/inbox/messages?$top=25&$orderby=receivedDateTime desc&$select=from,subject,bodyPreview,receivedDateTime`,
        { headers: gh(token) }
      ),
      fetch(
        `${GRAPH}/mailFolders/sentitems/messages?$top=15&$orderby=sentDateTime desc&$select=toRecipients,subject,bodyPreview,sentDateTime`,
        { headers: gh(token) }
      ),
    ]);
    const inbox = inboxR.ok ? (await inboxR.json()).value || [] : [];
    const sent = sentR.ok ? (await sentR.json()).value || [] : [];

    // Build a de-duped map of {email, name, subjects[], snippet}
    const people: Record<string, { email: string; name: string; subjects: Set<string>; snippet: string }> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of inbox as any[]) {
      const e = (m.from?.emailAddress?.address || "").toLowerCase();
      if (!e) continue;
      if (!people[e]) people[e] = { email: e, name: m.from?.emailAddress?.name || e, subjects: new Set(), snippet: (m.bodyPreview || "").slice(0, 160) };
      people[e].subjects.add(m.subject || "");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of sent as any[]) {
      const rcpt = m.toRecipients?.[0]?.emailAddress;
      const e = (rcpt?.address || "").toLowerCase();
      if (!e) continue;
      if (!people[e]) people[e] = { email: e, name: rcpt?.name || e, subjects: new Set(), snippet: (m.bodyPreview || "").slice(0, 160) };
      people[e].subjects.add(m.subject || "");
    }

    // Drop internal/self + obvious noise domains
    const skipDomain = /(conneticventures\.com|wendal\.io|microsoft\.com|noreply|no-reply|notifications|mailer|calendar)/i;
    const candidates = Object.values(people).filter((p) => !skipDomain.test(p.email));

    if (!candidates.length) return NextResponse.json({ success: true, suggestions: [] });

    // Exclude people already in leads or already seen/dismissed
    const emails = candidates.map((c) => c.email);
    const inList = `(${emails.map((e) => `"${e}"`).join(",")})`;
    const [existingLeads, seen] = await Promise.all([
      sbSelect<{ email: string }>(`ch_leads?email=in.${inList}&select=email`).catch(() => []),
      sbSelect<{ email: string }>(`ch_lead_seen?email=in.${inList}&select=email`).catch(() => []),
    ]);
    const known = new Set([
      ...existingLeads.map((r) => (r.email || "").toLowerCase()),
      ...seen.map((r) => (r.email || "").toLowerCase()),
    ]);
    const fresh = candidates.filter((c) => !known.has(c.email));
    if (!fresh.length) return NextResponse.json({ success: true, suggestions: [] });

    // Ask Claude to classify which are investor / startup conversations
    const list = fresh
      .map((c, i) => `${i}. ${c.name} <${c.email}> | subjects: ${[...c.subjects].slice(0, 3).join(" / ")} | ${c.snippet}`)
      .join("\n");
    const prompt = `You help a venture investor (Chris, of Connetic Ventures, who runs the VCAFX fund) triage email contacts into two deal pipelines.

For each contact, decide if the conversation is:
- "investor": someone Chris is raising from / discussing the VCAFX fund with (LP, fund investor, sent fund materials).
- "startup": a founder/company Chris is evaluating as a potential investment.
- "skip": anything else (vendors, ops, personal, generic networking, portfolio admin).

Only flag clear cases. Return ONLY a JSON array of the non-skip ones:
[{"i":0,"type":"investor","firm":"best guess firm or empty","reason":"4-8 words why"}]

Contacts:
${list}`;
    const raw = await askClaude(prompt, 800);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let picks: any[] = [];
    try {
      picks = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      picks = [];
    }

    const suggestions = picks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => fresh[p.i] && (p.type === "investor" || p.type === "startup"))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => ({
        email: fresh[p.i].email,
        name: fresh[p.i].name,
        type: p.type,
        firm: p.firm || "",
        reason: p.reason || "",
      }));

    return NextResponse.json({ success: true, suggestions });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

// POST: accept a suggestion (add as lead + mark seen) or dismiss it.
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const email = String(b.email || "").toLowerCase();
    if (!email) return NextResponse.json({ success: false, error: "email required" }, { status: 400 });
    const now = new Date().toISOString();

    async function markSeen(status: string) {
      // upsert-ish: try update, else insert
      try {
        const existing = await sbSelect<{ id: number }>(`ch_lead_seen?email=eq.${encodeURIComponent(email)}&select=id`);
        if (existing.length) {
          await sbUpdate(`ch_lead_seen?email=eq.${encodeURIComponent(email)}`, { status });
        } else {
          await sbInsert("ch_lead_seen", { email, status, created_at: now });
        }
      } catch {
        /* non-critical */
      }
    }

    if (b.action === "dismiss") {
      await markSeen("dismissed");
      return NextResponse.json({ success: true });
    }

    // accept -> create lead
    await sbInsert("ch_leads", {
      type: b.type === "startup" ? "startup" : "investor",
      name: b.name || email,
      firm: b.firm || null,
      email,
      stage: b.type === "startup" ? "Sourced" : "Identified",
      notes: b.reason ? `Auto-detected: ${b.reason}` : "",
      last_touch: now,
      created_at: now,
      updated_at: now,
    });
    await markSeen("added");
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
