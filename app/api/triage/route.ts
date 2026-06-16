import { NextResponse } from "next/server";
import {
  AUTO_SEND,
  AUTO_UNSUBSCRIBE,
  UNSUBSCRIBE_CATEGORIES,
  CATEGORIES,
  FORWARD_RULES,
  ARCHIVE_CATEGORIES,
  URGENT_CATEGORIES,
  SCAN_LIMIT,
} from "@/lib/routing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

// ---- Gmail auth -------------------------------------------------
async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ---- Labels -----------------------------------------------------
async function ensureLabels(
  token: string,
  names: string[]
): Promise<Record<string, string>> {
  const res = await fetch(`${GMAIL}/labels`, { headers: authHeaders(token) });
  const { labels = [] } = await res.json();
  const map: Record<string, string> = {};
  for (const l of labels) map[l.name] = l.id;
  for (const name of names) {
    if (!map[name]) {
      const create = await fetch(`${GMAIL}/labels`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          name,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        }),
      });
      const created = await create.json();
      map[name] = created.id;
    }
  }
  return map;
}

// ---- Reading messages ------------------------------------------
async function listUntriaged(token: string): Promise<string[]> {
  const q = encodeURIComponent("in:inbox -label:Triaged");
  const res = await fetch(
    `${GMAIL}/messages?q=${q}&maxResults=${SCAN_LIMIT}`,
    { headers: authHeaders(token) }
  );
  const data = await res.json();
  return (data.messages || []).map((m: { id: string }) => m.id);
}

function header(headers: { name: string; value: string }[], name: string): string {
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  if (payload.parts) {
    const plain = payload.parts.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => p.mimeType === "text/plain"
    );
    if (plain?.body?.data) {
      return Buffer.from(plain.body.data, "base64").toString("utf8");
    }
    for (const p of payload.parts) {
      const t = extractBody(p);
      if (t) return t;
    }
  }
  return "";
}

async function getMessage(token: string, id: string) {
  const res = await fetch(`${GMAIL}/messages/${id}?format=full`, {
    headers: authHeaders(token),
  });
  const msg = await res.json();
  const headers = msg.payload?.headers || [];
  return {
    id,
    threadId: msg.threadId as string,
    from: header(headers, "From"),
    to: header(headers, "To"),
    subject: header(headers, "Subject"),
    snippet: (msg.snippet as string) || "",
    body: extractBody(msg.payload).slice(0, 4000),
    listUnsubscribe: header(headers, "List-Unsubscribe"),
    listUnsubscribePost: header(headers, "List-Unsubscribe-Post"),
  };
}

// ---- Unsubscribe (safe, standards-based) -----------------------
// Uses the List-Unsubscribe header. Only AUTO-acts via the RFC 8058
// one-click POST flow, which is the same safe mechanism Gmail's own
// Unsubscribe button uses. Anything else is reported for manual review.
async function handleUnsubscribe(msg: {
  listUnsubscribe: string;
  listUnsubscribePost: string;
}): Promise<{ acted: boolean; note: string } | null> {
  if (!msg.listUnsubscribe) return null;

  const urls = [...msg.listUnsubscribe.matchAll(/<([^>]+)>/g)].map((m) => m[1]);
  const https = urls.find((u) => u.toLowerCase().startsWith("http"));
  const mailto = urls.find((u) => u.toLowerCase().startsWith("mailto:"));
  const oneClick = /one-click/i.test(msg.listUnsubscribePost || "");

  // Safe automatic path: one-click POST.
  if (AUTO_UNSUBSCRIBE && https && oneClick) {
    try {
      const r = await fetch(https, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });
      return r.ok
        ? { acted: true, note: "unsubscribed (one-click)" }
        : { acted: false, note: `one-click POST failed (${r.status})` };
    } catch {
      return { acted: false, note: "one-click POST errored" };
    }
  }

  // Otherwise just describe what's available — no auto-action.
  if (https && oneClick) return { acted: false, note: "one-click available (review mode)" };
  if (https) return { acted: false, note: "manual unsubscribe link only" };
  if (mailto) return { acted: false, note: "email-based unsubscribe only" };
  return null;
}

// ---- Classification (Claude) -----------------------------------
type Verdict = {
  category: string;
  urgent: boolean;
  human_waiting: boolean;
  summary: string;
  draft_reply: string;
};

async function classify(msg: {
  from: string;
  subject: string;
  body: string;
  snippet: string;
}): Promise<Verdict> {
  const prompt = `You are an email triage assistant. Classify the email below.

Allowed categories: ${CATEGORIES.join(", ")}

Return ONLY a JSON object — no prose, no markdown fences — with exactly these keys:
{
  "category": one of the allowed categories,
  "urgent": boolean (true only if it genuinely needs a fast human response),
  "human_waiting": boolean (true only if a real person is waiting on a reply; false for automated, marketing, or no-reply mail),
  "summary": one short sentence describing the email,
  "draft_reply": if human_waiting is true, a short, polite, ready-to-send reply; otherwise an empty string
}

Email:
From: ${msg.from}
Subject: ${msg.subject}
Body: ${msg.body || msg.snippet}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const text = (data.content || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text)
    .join("");
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean) as Verdict;
  } catch {
    return {
      category: "other",
      urgent: false,
      human_waiting: false,
      summary: "Could not classify",
      draft_reply: "",
    };
  }
}

// ---- Drafts + modify -------------------------------------------
function base64url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createDraft(
  token: string,
  opts: { to: string; subject: string; body: string; threadId?: string }
) {
  const mime =
    `To: ${opts.to}\r\n` +
    `Subject: ${opts.subject}\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n` +
    `\r\n` +
    opts.body;
  await fetch(`${GMAIL}/drafts`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      message: { raw: base64url(mime), threadId: opts.threadId },
    }),
  });
}

async function modify(
  token: string,
  id: string,
  add: string[] = [],
  remove: string[] = []
) {
  await fetch(`${GMAIL}/messages/${id}/modify`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
}

// ---- Main handler ----------------------------------------------
export async function GET() {
  try {
    const token = await getAccessToken();

    const labelNames = [
      "Triaged",
      "Triage/unsubscribe-candidate",
      "Triage/unsubscribed",
      ...CATEGORIES.map((c) => `Triage/${c}`),
    ];
    const labelMap = await ensureLabels(token, labelNames);

    const ids = await listUntriaged(token);
    const actions: Array<Record<string, unknown>> = [];

    for (const id of ids) {
      const msg = await getMessage(token, id);
      const verdict = await classify(msg);
      const add: string[] = [];
      const remove: string[] = [];
      const did: string[] = [];

      const catLabel = labelMap[`Triage/${verdict.category}`];
      if (catLabel) {
        add.push(catLabel);
        did.push(`labeled ${verdict.category}`);
      }

      // Unsubscribe handling (only for eligible categories).
      if (UNSUBSCRIBE_CATEGORIES.includes(verdict.category)) {
        const result = await handleUnsubscribe(msg);
        if (result) {
          if (result.acted) {
            add.push(labelMap["Triage/unsubscribed"]);
            did.push(result.note);
          } else {
            add.push(labelMap["Triage/unsubscribe-candidate"]);
            did.push(`unsub: ${result.note}`);
          }
        }
      }

      if (ARCHIVE_CATEGORIES.includes(verdict.category)) {
        remove.push("INBOX");
        did.push("archived");
      }

      if (verdict.urgent || URGENT_CATEGORIES.includes(verdict.category)) {
        add.push("STARRED", "IMPORTANT");
        did.push("flagged urgent");
      }

      if (verdict.human_waiting && verdict.draft_reply) {
        const replySubject = msg.subject.startsWith("Re:")
          ? msg.subject
          : `Re: ${msg.subject}`;
        await createDraft(token, {
          to: msg.from,
          subject: replySubject,
          body: verdict.draft_reply,
          threadId: msg.threadId,
        });
        did.push("drafted reply");
      }

      const fwd = FORWARD_RULES[verdict.category];
      if (fwd && fwd.length) {
        const valid = fwd.filter((a) => a && !a.startsWith("REPLACE_WITH"));
        if (valid.length) {
          await createDraft(token, {
            to: valid.join(", "),
            subject: `Fwd: ${msg.subject}`,
            body:
              `Forwarding — ${verdict.summary}\n\n` +
              `From: ${msg.from}\n\n${msg.body || msg.snippet}`,
          });
          did.push(`drafted forward to ${valid.join(", ")}`);
        }
      }

      add.push(labelMap["Triaged"]);
      await modify(token, id, add, remove);

      actions.push({
        from: msg.from,
        subject: msg.subject,
        category: verdict.category,
        urgent: verdict.urgent,
        summary: verdict.summary,
        did,
      });
    }

    return NextResponse.json({
      success: true,
      auto_send: AUTO_SEND,
      auto_unsubscribe: AUTO_UNSUBSCRIBE,
      scanned: ids.length,
      actions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
