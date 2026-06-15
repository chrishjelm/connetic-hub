import { NextResponse } from "next/server";
import { graphToken, gh, GRAPH } from "@/lib/graph";
import { sbSelect, sbInsert, sbUpdate } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";

// ---------- Tool definitions exposed to the model ----------
const tools = [
  {
    name: "search_mail",
    description:
      "Search the user's mailbox for messages. Returns id, sender, subject, preview, date. Use for questions about email or to find a message before drafting a reply.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "keywords, sender name, or subject to search for" },
        folder: { type: "string", enum: ["inbox", "sentitems"], description: "which folder; defaults inbox" },
        limit: { type: "number", description: "max results (default 8)" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_message",
    description: "Read the full body of one message by id (from search_mail results).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "list_calendar",
    description:
      "List the user's calendar events between two ISO datetimes. Use for questions about the schedule.",
    input_schema: {
      type: "object",
      properties: {
        start: { type: "string", description: "ISO start datetime" },
        end: { type: "string", description: "ISO end datetime" },
      },
      required: ["start", "end"],
    },
  },
  {
    name: "find_documents",
    description: "Find recent or named documents in the user's OneDrive/SharePoint.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "optional name to search; omit for most recent" } },
    },
  },
  {
    name: "lookup_person",
    description:
      "Look up saved context about a person by email (tone, history, preferences) to tailor a reply.",
    input_schema: {
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    },
  },
  {
    name: "propose_reply",
    description:
      "Propose a reply to a specific message for the user to approve and send. Does NOT send — returns a proposal card. Use after reading the message.",
    input_schema: {
      type: "object",
      properties: {
        message_id: { type: "string", description: "id of the message being replied to" },
        to: { type: "string", description: "recipient display name (for the card)" },
        subject: { type: "string" },
        body: { type: "string", description: "the full proposed reply text" },
      },
      required: ["message_id", "body"],
    },
  },
  {
    name: "propose_email",
    description:
      "Propose a brand-new email (not a reply) for the user to approve and send. Does NOT send.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "recipient email address(es), comma separated" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "list_leads",
    description:
      "List the user's pipeline leads. type 'investor' = VCAFX investors; 'startup' = founders being evaluated. Use to answer pipeline questions.",
    input_schema: {
      type: "object",
      properties: { type: { type: "string", enum: ["investor", "startup"] } },
      required: ["type"],
    },
  },
  {
    name: "add_lead",
    description:
      "Add a new lead to a pipeline. Investor stages: Identified, Materials sent, In discussion, Committed, Passed. Startup stages: Sourced, Intro call, Diligence, Term sheet, Invested, Passed.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["investor", "startup"] },
        name: { type: "string" },
        firm: { type: "string", description: "firm (investor) or company (startup)" },
        email: { type: "string" },
        stage: { type: "string" },
        amount: { type: "string", description: "commitment size or round size" },
        next_step: { type: "string" },
        notes: { type: "string" },
      },
      required: ["type", "name"],
    },
  },
  {
    name: "update_lead",
    description:
      "Update an existing lead by id (from list_leads) — e.g. move stage, set next step, add notes.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number" },
        stage: { type: "string" },
        next_step: { type: "string" },
        notes: { type: "string" },
        amount: { type: "string" },
      },
      required: ["id"],
    },
  },
];

const SYSTEM = `You are Chris Hjelm's executive assistant inside the Connetic Hub app. Today is ${new Date().toString()}. The user's timezone is US Eastern.

You can read the user's mail, calendar, documents, and saved people-context using tools. Use them to answer questions accurately — never invent calendar events, emails, or facts; look them up.

When the user wants to reply to or send an email, gather what you need (search/read), then use propose_reply or propose_email. NEVER claim something was sent — these only create a proposal the user approves. Drafts should be concise, professional, and ready to send (no placeholders).

When you have the final answer or have created a proposal, stop and respond in plain text. Keep answers tight and skimmable. If you propose an action, briefly say what you've drafted and that it's ready for approval.

You also manage two deal pipelines via list_leads/add_lead/update_lead: "investor" (VCAFX investors the user has sent materials to or discussed the fund with) and "startup" (founders being evaluated). Adding or updating a lead is a low-risk database write you may do directly when the user clearly asks (e.g. "add Byron as an investor lead, sent materials" -> add_lead type=investor stage='Materials sent'). Confirm back what you recorded. For pipeline questions, use list_leads.`;

// ---------- Tool executors ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runTool(name: string, input: any, token: string): Promise<any> {
  if (name === "search_mail") {
    const folder = input.folder === "sentitems" ? "sentitems" : "inbox";
    const limit = Math.min(input.limit || 8, 15);
    const q = encodeURIComponent(input.query || "");
    const r = await fetch(
      `${GRAPH}/mailFolders/${folder}/messages?$search="${q}"&$top=${limit}&$select=id,subject,from,toRecipients,bodyPreview,receivedDateTime`,
      { headers: { ...gh(token), ConsistencyLevel: "eventual" } }
    );
    if (!r.ok) {
      // $search can fail with some queries; fall back to recent + filter
      const r2 = await fetch(
        `${GRAPH}/mailFolders/${folder}/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,from,bodyPreview,receivedDateTime`,
        { headers: gh(token) }
      );
      if (!r2.ok) return { error: await r2.text() };
      const d = await r2.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (d.value || []).map((m: any) => ({
        id: m.id,
        from: m.from?.emailAddress?.name,
        email: m.from?.emailAddress?.address,
        subject: m.subject,
        preview: (m.bodyPreview || "").slice(0, 200),
        date: m.receivedDateTime,
      }));
    }
    const d = await r.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (d.value || []).map((m: any) => ({
      id: m.id,
      from: m.from?.emailAddress?.name,
      email: m.from?.emailAddress?.address,
      subject: m.subject,
      preview: (m.bodyPreview || "").slice(0, 200),
      date: m.receivedDateTime,
    }));
  }

  if (name === "read_message") {
    const r = await fetch(
      `${GRAPH}/messages/${input.id}?$select=subject,from,toRecipients,body,bodyPreview,receivedDateTime`,
      { headers: gh(token) }
    );
    if (!r.ok) return { error: await r.text() };
    const m = await r.json();
    return {
      from: m.from?.emailAddress?.name,
      email: m.from?.emailAddress?.address,
      subject: m.subject,
      date: m.receivedDateTime,
      body: (m.body?.content || m.bodyPreview || "").replace(/<[^>]+>/g, " ").slice(0, 6000),
    };
  }

  if (name === "list_calendar") {
    const r = await fetch(
      `${GRAPH}/calendarView?startDateTime=${encodeURIComponent(input.start)}&endDateTime=${encodeURIComponent(input.end)}&$select=subject,start,end,location,onlineMeeting,attendees,isAllDay&$orderby=start/dateTime&$top=40`,
      { headers: { ...gh(token), Prefer: 'outlook.timezone="Eastern Standard Time"' } }
    );
    if (!r.ok) return { error: await r.text() };
    const d = await r.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (d.value || []).map((e: any) => ({
      subject: e.subject,
      start: e.start?.dateTime,
      end: e.end?.dateTime,
      allDay: e.isAllDay,
      location: e.location?.displayName || (e.onlineMeeting?.joinUrl ? "Teams" : ""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attendees: (e.attendees || []).map((a: any) => a.emailAddress?.name).filter(Boolean).slice(0, 8),
    }));
  }

  if (name === "find_documents") {
    const url = input.query
      ? `${GRAPH}/drive/root/search(q='${encodeURIComponent(input.query)}')?$top=8&$select=name,webUrl,lastModifiedDateTime`
      : `${GRAPH}/drive/recent?$top=8`;
    const r = await fetch(url, { headers: gh(token) });
    if (!r.ok) return { error: await r.text() };
    const d = await r.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (d.value || []).filter((f: any) => f.name).map((f: any) => ({
      name: f.name,
      url: f.webUrl,
      modified: f.lastModifiedDateTime,
    })).slice(0, 6);
  }

  if (name === "lookup_person") {
    try {
      const rows = await sbSelect<{ name: string; role: string; notes: string }>(
        `ch_people?email=eq.${encodeURIComponent((input.email || "").toLowerCase())}&select=name,role,notes`
      );
      return rows[0] || { note: "No saved context for this person." };
    } catch {
      return { note: "No saved context." };
    }
  }

  if (name === "propose_reply") {
    return {
      _proposal: {
        kind: "reply",
        message_id: input.message_id,
        to: input.to || "",
        subject: input.subject || "",
        body: input.body,
      },
    };
  }

  if (name === "propose_email") {
    return {
      _proposal: {
        kind: "email",
        to: input.to,
        subject: input.subject,
        body: input.body,
      },
    };
  }

  if (name === "list_leads") {
    try {
      const rows = await sbSelect(
        `ch_leads?type=eq.${encodeURIComponent(input.type)}&order=stage.asc&select=id,name,firm,email,stage,amount,next_step,notes,last_touch`
      );
      return rows;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (name === "add_lead") {
    try {
      const now = new Date().toISOString();
      await sbInsert("ch_leads", {
        type: input.type,
        name: input.name,
        firm: input.firm || null,
        email: input.email || null,
        stage: input.stage || (input.type === "startup" ? "Sourced" : "Identified"),
        amount: input.amount || null,
        next_step: input.next_step || null,
        notes: input.notes || "",
        last_touch: now,
        created_at: now,
        updated_at: now,
      });
      return { added: true, name: input.name };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (name === "update_lead") {
    try {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["stage", "next_step", "notes", "amount"]) {
        if (input[k] !== undefined) patch[k] = input[k];
      }
      await sbUpdate(`ch_leads?id=eq.${encodeURIComponent(input.id)}`, patch);
      return { updated: true, id: input.id };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return { error: `unknown tool ${name}` };
}

async function anthropic(body: object) {
  const r = await fetch(ANTHROPIC, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    // messages: prior [{role, content}] conversation from the client
    const token = await graphToken();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const convo: any[] = Array.isArray(messages) ? [...messages] : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let proposal: any = null;

    // Tool-use loop (cap iterations for safety)
    for (let step = 0; step < 6; step++) {
      const resp = await anthropic({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        tools,
        messages: convo,
      });

      convo.push({ role: "assistant", content: resp.content });

      const toolUses = (resp.content || []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (b: any) => b.type === "tool_use"
      );

      if (resp.stop_reason !== "tool_use" || toolUses.length === 0) {
        // Final text answer
        const text = (resp.content || [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((b: any) => b.type === "text")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((b: any) => b.text)
          .join("")
          .trim();
        return NextResponse.json({ success: true, reply: text, proposal, messages: convo });
      }

      // Run each requested tool
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = [];
      for (const tu of toolUses) {
        const out = await runTool(tu.name, tu.input, token);
        if (out && out._proposal) proposal = out._proposal;
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(out && out._proposal ? { proposed: true } : out).slice(0, 8000),
        });
      }
      convo.push({ role: "user", content: results });
    }

    return NextResponse.json({
      success: true,
      reply: "That needed more steps than I can take at once — try narrowing the request.",
      proposal,
      messages: convo,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
