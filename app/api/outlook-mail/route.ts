import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRAPH = "https://graph.microsoft.com/v1.0/me";
const CLIENT_ID =
  process.env.AZURE_CLIENT_ID || process.env.DYNAMICS_CLIENT_ID || "";
const CLIENT_SECRET =
  process.env.AZURE_CLIENT_SECRET || process.env.DYNAMICS_CLIENT_SECRET || "";
const TENANT =
  process.env.AZURE_TENANT_ID || process.env.DYNAMICS_TENANT_ID || "organizations";

async function getToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: process.env.OUTLOOK_REFRESH_TOKEN!,
        grant_type: "refresh_token",
        scope: "offline_access User.Read Mail.ReadWrite Mail.Send",
      }),
    }
  );
  if (!res.ok) throw new Error(`auth ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

function h(t: string) {
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

function fail(msg: string, status = 500) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findHeader(headers: any[], name: string): string {
  if (!Array.isArray(headers)) return "";
  const x = headers.find(
    (q) => (q.name || "").toLowerCase() === name.toLowerCase()
  );
  return x ? x.value || "" : "";
}

type Unsub = {
  available: boolean;
  oneClick: boolean;
  url: string;
  mailto: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseUnsub(headers: any[]): Unsub {
  const lu = findHeader(headers, "List-Unsubscribe");
  const lup = findHeader(headers, "List-Unsubscribe-Post");
  if (!lu) return { available: false, oneClick: false, url: "", mailto: "" };
  const urls = [...lu.matchAll(/<([^>]+)>/g)].map((m) => m[1]);
  const url = urls.find((u) => u.toLowerCase().startsWith("http")) || "";
  const mailto = urls.find((u) => u.toLowerCase().startsWith("mailto:")) || "";
  const oneClick = !!(url && /one-click/i.test(lup));
  return { available: !!(url || mailto), oneClick, url, mailto };
}

// ---- GET: list a folder, or fetch one full message (?id=) ------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const folder = searchParams.get("folder") || "inbox";
    const t = await getToken();

    if (id) {
      const r = await fetch(
        `${GRAPH}/messages/${id}?$select=id,subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,isRead,hasAttachments,internetMessageHeaders`,
        { headers: h(t) }
      );
      if (!r.ok) return fail(await r.text(), r.status);
      const m = await r.json();
      m.unsub = parseUnsub(m.internetMessageHeaders || []);
      delete m.internetMessageHeaders;
      return NextResponse.json({ success: true, message: m });
    }

    const r = await fetch(
      `${GRAPH}/mailFolders/${folder}/messages` +
        `?$top=30&$orderby=receivedDateTime desc` +
        `&$select=id,subject,from,bodyPreview,receivedDateTime,isRead,hasAttachments,internetMessageHeaders`,
      { headers: h(t) }
    );
    if (!r.ok) return fail(await r.text(), r.status);
    const data = await r.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = (data.value || []).map((m: any) => {
      const unsub = parseUnsub(m.internetMessageHeaders || []);
      delete m.internetMessageHeaders;
      return { ...m, unsub };
    });
    return NextResponse.json({ success: true, messages });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

// ---- POST: actions ---------------------------------------------
export async function POST(req: Request) {
  try {
    const t = await getToken();
    const b = await req.json();
    const { action, id } = b;

    if (action === "send") {
      const to = String(b.to || "")
        .split(",")
        .map((a: string) => a.trim())
        .filter(Boolean)
        .map((address: string) => ({ emailAddress: { address } }));
      if (!to.length) return fail("No recipient", 400);
      const r = await fetch(`${GRAPH}/sendMail`, {
        method: "POST",
        headers: h(t),
        body: JSON.stringify({
          message: {
            subject: b.subject || "(no subject)",
            body: { contentType: "Text", content: b.content || "" },
            toRecipients: to,
          },
          saveToSentItems: true,
        }),
      });
      if (!r.ok) return fail(await r.text(), r.status);
      return NextResponse.json({ success: true });
    }

    if (action === "suggest") {
      if (!id) return fail("Missing id", 400);
      const mr = await fetch(
        `${GRAPH}/messages/${id}?$select=subject,from,body,bodyPreview`,
        { headers: h(t) }
      );
      if (!mr.ok) return fail(await mr.text(), mr.status);
      const m = await mr.json();
      const text = (m.body?.content || m.bodyPreview || "")
        .replace(/<[^>]+>/g, " ")
        .slice(0, 4000);
      const prompt = `You are drafting a reply on behalf of the mailbox owner. Write a concise, professional, ready-to-send reply to the email below. Return ONLY the reply body text — no subject line, no "[Your name]" placeholders, no commentary.

From: ${m.from?.emailAddress?.address}
Subject: ${m.subject}
Body: ${text}`;
      const reply = await askClaude(prompt, 600);
      return NextResponse.json({ success: true, reply });
    }

    if (action === "analyze") {
      if (!id) return fail("Missing id", 400);
      const mr = await fetch(
        `${GRAPH}/messages/${id}?$select=subject,from,body,bodyPreview,internetMessageHeaders`,
        { headers: h(t) }
      );
      if (!mr.ok) return fail(await mr.text(), mr.status);
      const m = await mr.json();
      const unsub = parseUnsub(m.internetMessageHeaders || []);
      const text = (m.body?.content || m.bodyPreview || "")
        .replace(/<[^>]+>/g, " ")
        .slice(0, 3000);
      const prompt = `You are an email assistant. Read the email and recommend ONE action.

Return ONLY JSON, no markdown:
{
  "category": short label (e.g. promotion, newsletter, personal, work, invoice, notification),
  "recommended": one of "reply" | "archive" | "unsubscribe" | "keep",
  "reason": one short sentence explaining the recommendation
}

Guidance: "reply" if a real person is waiting on a response; "unsubscribe" if it's recurring marketing the owner likely doesn't want; "archive" for low-value automated mail to file away; "keep" if it should stay visible in the inbox.

From: ${m.from?.emailAddress?.address}
Subject: ${m.subject}
Body: ${text}`;
      const raw = await askClaude(prompt, 300);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      } catch {
        parsed = { category: "other", recommended: "keep", reason: "Unclear." };
      }
      // Don't recommend unsubscribe if it isn't actually possible.
      if (parsed.recommended === "unsubscribe" && !unsub.available) {
        parsed.recommended = "archive";
      }
      return NextResponse.json({ success: true, ...parsed, unsub });
    }

    if (action === "unsubscribe") {
      let url = b.url as string | undefined;
      if (!url && id) {
        const mr = await fetch(
          `${GRAPH}/messages/${id}?$select=internetMessageHeaders`,
          { headers: h(t) }
        );
        if (mr.ok) {
          const m = await mr.json();
          url = parseUnsub(m.internetMessageHeaders || []).url;
        }
      }
      if (!url) return fail("No one-click unsubscribe available", 400);
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });
      return NextResponse.json({ success: r.ok, status: r.status });
    }

    if (action === "reply") {
      if (!id) return fail("Missing id", 400);
      const r = await fetch(`${GRAPH}/messages/${id}/reply`, {
        method: "POST",
        headers: h(t),
        body: JSON.stringify({ comment: b.content || "" }),
      });
      if (!r.ok) return fail(await r.text(), r.status);
      return NextResponse.json({ success: true });
    }

    if (action === "archive") {
      if (!id) return fail("Missing id", 400);
      const r = await fetch(`${GRAPH}/messages/${id}/move`, {
        method: "POST",
        headers: h(t),
        body: JSON.stringify({ destinationId: "archive" }),
      });
      if (!r.ok) return fail(await r.text(), r.status);
      return NextResponse.json({ success: true });
    }

    if (action === "delete") {
      if (!id) return fail("Missing id", 400);
      const r = await fetch(`${GRAPH}/messages/${id}`, {
        method: "DELETE",
        headers: h(t),
      });
      if (!r.ok && r.status !== 204) return fail(await r.text(), r.status);
      return NextResponse.json({ success: true });
    }

    if (action === "markRead") {
      if (!id) return fail("Missing id", 400);
      const r = await fetch(`${GRAPH}/messages/${id}`, {
        method: "PATCH",
        headers: h(t),
        body: JSON.stringify({ isRead: true }),
      });
      if (!r.ok) return fail(await r.text(), r.status);
      return NextResponse.json({ success: true });
    }

    return fail("Unknown action", 400);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function askClaude(prompt: string, maxTokens: number): Promise<string> {
  const ar = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
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
