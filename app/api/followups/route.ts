// app/api/followups/route.ts
// GET  /api/followups?days=10        -> sent messages with no reply yet
// POST /api/followups  { subject, to, sentDate }  -> a drafted nudge (text)
//
// "Awaiting reply" = you sent it, and no one else in that conversation has
// written back since. We only look back `days` and skip very recent sends.

import { NextRequest, NextResponse } from "next/server";
import {
  recentSent,
  hasReplyAfter,
  graphConfigured,
  GMessage,
} from "@/lib/graph";
import { ask } from "@/lib/assist";

export const dynamic = "force-dynamic";

const ME = (process.env.MS_USER_EMAIL || "hjelm@conneticventures.com").toLowerCase();
const QUIET_HOURS = 18; // don't flag things sent in the last 18h — too soon

export async function GET(req: NextRequest) {
  if (!graphConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }
  const days = Math.min(
    30,
    Math.max(1, Number(req.nextUrl.searchParams.get("days") || "10"))
  );
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const tooRecent = Date.now() - QUIET_HOURS * 3600 * 1000;

  let sent: GMessage[];
  try {
    sent = await recentSent(40);
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }

  // de-dupe to the latest sent message per conversation, within the window
  const byConv = new Map<string, GMessage>();
  for (const m of sent) {
    const t = m.sentDateTime ? new Date(m.sentDateTime).getTime() : 0;
    if (t < cutoff || t > tooRecent) continue;
    const key = m.conversationId || m.id;
    const prev = byConv.get(key);
    if (!prev || t > new Date(prev.sentDateTime || 0).getTime()) {
      byConv.set(key, m);
    }
  }

  const candidates = [...byConv.values()].slice(0, 20);
  const checked = await Promise.all(
    candidates.map(async (m) => {
      const replied = m.conversationId
        ? await hasReplyAfter(m.conversationId, m.sentDateTime || "", ME)
        : false;
      return { m, replied };
    })
  );

  const items = checked
    .filter((c) => !c.replied)
    .map(({ m }) => {
      const to = (m.toRecipients || [])
        .map((r) => r.emailAddress?.name || r.emailAddress?.address || "")
        .filter(Boolean);
      const sentMs = m.sentDateTime ? new Date(m.sentDateTime).getTime() : 0;
      const waitingDays = Math.max(
        0,
        Math.round((Date.now() - sentMs) / (24 * 3600 * 1000))
      );
      return {
        id: m.id,
        subject: m.subject || "(no subject)",
        to,
        toEmails: (m.toRecipients || [])
          .map((r) => r.emailAddress?.address)
          .filter(Boolean),
        sentDate: m.sentDateTime,
        waitingDays,
        preview: (m.bodyPreview || "").slice(0, 160),
      };
    })
    .sort((a, b) => b.waitingDays - a.waitingDays);

  return NextResponse.json({ configured: true, items });
}

export async function POST(req: NextRequest) {
  const { subject, to, sentDate, preview } = (await req.json()) as {
    subject?: string;
    to?: string;
    sentDate?: string;
    preview?: string;
  };
  const draft = await ask(
    "You write short, warm, low-pressure follow-up nudges for a busy founder. " +
      "2-4 sentences, no subject line, sign off as Chris. Don't be pushy or " +
      "guilt-trippy; give them an easy out.",
    `Original subject: ${subject}
Sent to: ${to}
Sent on: ${sentDate}
Gist of what I sent: ${preview || "(unknown)"}

Write a follow-up checking in.`,
    300
  );
  return NextResponse.json({
    draft:
      draft ||
      `Hi — just floating this back to the top of your inbox in case it slipped by. No rush at all; happy to adjust timing if it's easier. Thanks!\n\nChris`,
  });
}
