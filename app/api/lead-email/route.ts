import { NextResponse } from "next/server";
import { graphToken, gh, GRAPH } from "@/lib/graph";
import { sbSelect, sbUpdate } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Lead = {
  id: number;
  type: string;
  name: string;
  firm: string | null;
  email: string | null;
  stage: string | null;
  amount: string | null;
  next_step: string | null;
  notes: string | null;
  last_touch: string | null;
};

async function askClaude(prompt: string, maxTokens: number): Promise<string> {
  const ar = await fetch("https://api.anthropic.com/v1/messages", {
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
  if (!ar.ok) throw new Error(`Anthropic ${ar.status}: ${await ar.text()}`);
  const ad = await ar.json();
  return (ad.content || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((x: any) => x.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((x: any) => x.text)
    .join("")
    .trim();
}

function fail(error: string, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const action = b.action;

    // ---- DRAFT: write an email using the lead's deal context ----
    if (action === "draft") {
      const leadId = b.leadId;
      if (!leadId) return fail("Missing leadId", 400);

      const rows = await sbSelect<Lead>(
        `ch_leads?id=eq.${encodeURIComponent(leadId)}&select=id,type,name,firm,email,stage,amount,next_step,notes,last_touch`
      );
      const lead = rows[0];
      if (!lead) return fail("Lead not found", 404);

      // Pull any per-person notes from the people directory (by email).
      let personNote = "";
      if (lead.email) {
        const people = await sbSelect<{ name: string; role: string; notes: string }>(
          `ch_people?email=eq.${encodeURIComponent(lead.email)}&select=name,role,notes`
        ).catch(() => []);
        if (people[0]) {
          personNote = [people[0].role && `Role: ${people[0].role}`, people[0].notes && `Notes: ${people[0].notes}`]
            .filter(Boolean)
            .join("\n");
        }
      }

      const isInvestor = lead.type === "investor";
      const relationship = isInvestor
        ? "a prospective or current investor in the VCAFX fund"
        : "a founder / startup being evaluated for investment";

      const prompt = `You are drafting an email on behalf of Chris Hjelm at Connetic Ventures (VCAFX fund). Write a concise, warm, professional email that is ready to send — no placeholders, no brackets, no "[insert X]". Sign off as Chris.

The recipient is ${relationship}.

What I know about them:
- Name: ${lead.name}
${lead.firm ? `- Firm: ${lead.firm}` : ""}
${lead.stage ? `- Current stage in our pipeline: ${lead.stage}` : ""}
${lead.amount ? `- Amount in play: ${lead.amount}` : ""}
${lead.next_step ? `- The agreed/intended next step: ${lead.next_step}` : ""}
${lead.last_touch ? `- Last contact: ${lead.last_touch}` : ""}
${lead.notes ? `- My notes: ${lead.notes}` : ""}
${personNote ? `- Additional context: ${personNote}` : ""}

${b.instruction ? `Specific instruction for this email: ${b.instruction}` : "Write a natural next-touch email that moves the relationship forward based on the stage and next step above."}

Respond with ONLY a JSON object, no markdown fences, in exactly this shape:
{"subject": "...", "body": "..."}
The body should use real line breaks (\\n) between paragraphs.`;

      const raw = await askClaude(prompt, 900);
      const clean = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
      let parsed: { subject?: string; body?: string } = {};
      try {
        parsed = JSON.parse(clean);
      } catch {
        // Fallback: treat whole thing as body
        parsed = { subject: `Following up — ${lead.name}`, body: clean };
      }
      return NextResponse.json({
        success: true,
        to: lead.email || "",
        subject: parsed.subject || `Following up — ${lead.name}`,
        body: parsed.body || "",
      });
    }

    // ---- SEND: send via Outlook and bump last_touch ----
    if (action === "send") {
      const token = await graphToken();
      const to = String(b.to || "")
        .split(",")
        .map((a: string) => a.trim())
        .filter(Boolean)
        .map((address: string) => ({ emailAddress: { address } }));
      if (!to.length) return fail("No recipient", 400);

      const r = await fetch(`${GRAPH}/sendMail`, {
        method: "POST",
        headers: gh(token),
        body: JSON.stringify({
          message: {
            subject: b.subject || "(no subject)",
            body: { contentType: "Text", content: b.body || "" },
            toRecipients: to,
          },
          saveToSentItems: true,
        }),
      });
      if (!r.ok) return fail(await r.text(), r.status);

      // Update last_touch to today (non-fatal if it fails).
      if (b.leadId) {
        const today = new Date().toISOString().slice(0, 10);
        await sbUpdate(`ch_leads?id=eq.${encodeURIComponent(b.leadId)}`, { last_touch: today }).catch(() => {});
      }
      return NextResponse.json({ success: true });
    }

    return fail("Unknown action", 400);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
