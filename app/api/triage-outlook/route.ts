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

const GRAPH = "https://graph.microsoft.com/v1.0/me";

// Reuses the connetic-hub Azure app registration (same one as Dynamics).
const CLIENT_ID =
  process.env.AZURE_CLIENT_ID || process.env.DYNAMICS_CLIENT_ID || "";
const CLIENT_SECRET =
  process.env.AZURE_CLIENT_SECRET || process.env.DYNAMICS_CLIENT_SECRET || "";
const TENANT =
  process.env.AZURE_TENANT_ID || process.env.DYNAMICS_TENANT_ID || "organizations";

// ---- Auth -------------------------------------------------------
async function getAccessToken(): Promise<string> {
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

// ---- Categories live as Outlook categories (colored tags) ------
// Graph doesn't have Gmail-style nested labels, so we use Outlook
// "categories" named Triage/<x>, plus folder moves for archiving.

// ---- Reading messages ------------------------------------------
type GraphMessage = {
  id: string;
  subject: string;
  bodyPreview: string;
  from: string;
  body: string;
  categories: string[];
  listUnsubscribe: string;
  listUnsubscribePost: string;
};

async function listUntriaged(token: string): Promise<GraphMessage[]> {
  // Pull newest inbox messages that aren't already tagged Triaged.
  // internetMessageHeaders carries List-Unsubscribe / List-Unsubscribe-Post.
  const url =
    `${GRAPH}/mailFolders/inbox/messages` +
    `?$top=${SCAN_LIMIT}&$orderby=receivedDateTime desc` +
    `&$select=id,subject,bodyPreview,from,body,categories,internetMessageHeaders`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) {
    throw new Error(`List failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findHeader = (headers: any[], name: string): string => {
    if (!Array.isArray(headers)) return "";
    const h = headers.find(
      (x) => (x.name || "").toLowerCase() === name.toLowerCase()
    );
    return h ? h.value || "" : "";
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.value || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((m: any) => !(m.categories || []).includes("Triaged"))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({
      id: m.id,
      subject: m.subject || "",
      bodyPreview: m.bodyPreview || "",
      from: m.from?.emailAddress?.address || "",
      body: (m.body?.content || "").replace(/<[^>]+>/g, " ").slice(0, 4000),
      categories: m.categories || [],
      listUnsubscribe: findHeader(m.internetMessageHeaders, "List-Unsubscribe"),
      listUnsubscribePost: findHeader(
        m.internetMessageHeaders,
        "List-Unsubscribe-Post"
      ),
    }));
}

// ---- Unsubscribe (safe, standards-based) -----------------------
// Parses the List-Unsubscribe header. Only AUTO-acts via the RFC 8058
// one-click POST flow; anything else is reported for manual review.
async function handleUnsubscribe(
  msg: GraphMessage
): Promise<{ acted: boolean; note: string } | null> {
  if (!msg.listUnsubscribe) return null;

  const urls = [...msg.listUnsubscribe.matchAll(/<([^>]+)>/g)].map((m) => m[1]);
  const https = urls.find((u) => u.toLowerCase().startsWith("http"));
  const mailto = urls.find((u) => u.toLowerCase().startsWith("mailto:"));
  const oneClick = /one-click/i.test(msg.listUnsubscribePost || "");

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

  if (https && oneClick)
    return { acted: false, note: "one-click available (review mode)" };
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

async function classify(msg: GraphMessage): Promise<Verdict> {
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
Body: ${msg.body || msg.bodyPreview}`;

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

// ---- Actions ----------------------------------------------------
async function applyCategories(token: string, id: string, categories: string[]) {
  await fetch(`${GRAPH}/messages/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ categories }),
  });
}

async function setImportance(token: string, id: string, importance: "high") {
  await fetch(`${GRAPH}/messages/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ importance }),
  });
}

async function archive(token: string, id: string) {
  // Move to Archive well-known folder.
  await fetch(`${GRAPH}/messages/${id}/move`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ destinationId: "archive" }),
  });
}

async function createReplyDraft(token: string, id: string, body: string) {
  // createReply makes a draft reply in the same thread; then patch its body.
  const res = await fetch(`${GRAPH}/messages/${id}/createReply`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ comment: body }),
  });
  return res.ok;
}

async function createForwardDraft(
  token: string,
  id: string,
  to: string[],
  comment: string
) {
  await fetch(`${GRAPH}/messages/${id}/createForward`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      comment,
      toRecipients: to.map((address) => ({ emailAddress: { address } })),
    }),
  });
}

// ---- Main handler ----------------------------------------------
export async function GET() {
  try {
    const token = await getAccessToken();
    const messages = await listUntriaged(token);
    const actions: Array<Record<string, unknown>> = [];

    for (const msg of messages) {
      const verdict = await classify(msg);
      const cats = new Set<string>(msg.categories);
      const did: string[] = [];

      cats.add(`Triage/${verdict.category}`);
      did.push(`labeled ${verdict.category}`);

      if (UNSUBSCRIBE_CATEGORIES.includes(verdict.category)) {
        const result = await handleUnsubscribe(msg);
        if (result) {
          if (result.acted) {
            cats.add("Triage/unsubscribed");
            did.push(result.note);
          } else {
            cats.add("Triage/unsubscribe-candidate");
            did.push(`unsub: ${result.note}`);
          }
        }
      }

      if (verdict.urgent || URGENT_CATEGORIES.includes(verdict.category)) {
        await setImportance(token, msg.id, "high");
        did.push("flagged urgent");
      }

      if (verdict.human_waiting && verdict.draft_reply) {
        await createReplyDraft(token, msg.id, verdict.draft_reply);
        did.push("drafted reply");
      }

      const fwd = FORWARD_RULES[verdict.category];
      if (fwd && fwd.length) {
        const valid = fwd.filter((a) => a && !a.startsWith("REPLACE_WITH"));
        if (valid.length) {
          await createForwardDraft(
            token,
            msg.id,
            valid,
            `Forwarding — ${verdict.summary}`
          );
          did.push(`drafted forward to ${valid.join(", ")}`);
        }
      }

      // Mark triaged, then write all categories in one PATCH.
      cats.add("Triaged");
      await applyCategories(token, msg.id, [...cats]);

      // Archive noise last (after categorizing).
      if (ARCHIVE_CATEGORIES.includes(verdict.category)) {
        await archive(token, msg.id);
        did.push("archived");
      }

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
      mailbox: "outlook",
      auto_send: AUTO_SEND,
      auto_unsubscribe: AUTO_UNSUBSCRIBE,
      scanned: messages.length,
      actions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
