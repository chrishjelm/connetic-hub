// app/api/meetings/route.ts
// GET /api/meetings?days=2
// Returns upcoming real meetings with a one-glance prep brief for each:
// pulls recent mail with the attendees + your saved people-notes, and has
// Claude distill "what you need to know walking in."

import { NextRequest, NextResponse } from "next/server";
import {
  getCalendarView,
  messagesWith,
  graphConfigured,
  GEvent,
} from "@/lib/graph";
import { peopleContext, ask, PersonNote } from "@/lib/assist";

export const dynamic = "force-dynamic";

const ME = (process.env.MS_USER_EMAIL || "hjelm@conneticventures.com").toLowerCase();

// meetings we don't need a prep card for
function isPrepWorthy(e: GEvent): boolean {
  if (e.isCancelled || e.isAllDay) return false;
  const subj = (e.subject || "").trim();
  if (subj.startsWith("[F]")) return false; // personal/golf/family blocks
  const others = (e.attendees || []).filter(
    (a) => (a.emailAddress?.address || "").toLowerCase() !== ME
  );
  return others.length > 0; // skip solo holds
}

function attendeeEmails(e: GEvent): string[] {
  const set = new Set<string>();
  const org = e.organizer?.emailAddress?.address?.toLowerCase();
  if (org && org !== ME) set.add(org);
  for (const a of e.attendees || []) {
    const addr = a.emailAddress?.address?.toLowerCase();
    if (addr && addr !== ME) set.add(addr);
  }
  return [...set];
}

export async function GET(req: NextRequest) {
  if (!graphConfigured()) {
    return NextResponse.json(
      { configured: false, meetings: [] },
      { status: 200 }
    );
  }
  const days = Math.min(
    14,
    Math.max(1, Number(req.nextUrl.searchParams.get("days") || "2"))
  );
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 3600 * 1000);

  let events: GEvent[];
  try {
    events = await getCalendarView(now.toISOString(), end.toISOString(), 50);
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }

  const worthy = events.filter(isPrepWorthy).slice(0, 8); // cap for latency/cost

  const meetings = await Promise.all(
    worthy.map(async (e) => {
      const emails = attendeeEmails(e);
      const notes = await peopleContext(emails);

      // pull recent mail with up to the 3 most relevant attendees
      const threadLists = await Promise.all(
        emails.slice(0, 3).map((addr) => messagesWith(addr, 3))
      );
      const recent = threadLists.flat().slice(0, 6);

      const recentForAI = recent
        .map(
          (m) =>
            `- (${m.receivedDateTime?.slice(0, 10) || "?"}) ${
              m.from?.emailAddress?.name || m.from?.emailAddress?.address || ""
            }: ${m.subject || ""} — ${(m.bodyPreview || "").slice(0, 140)}`
        )
        .join("\n");

      const notesForAI = Object.values(notes)
        .map(
          (p: PersonNote) =>
            `- ${p.name || p.email}${p.role ? ` (${p.role})` : ""}: ${
              p.notes || ""
            }`
        )
        .join("\n");

      const brief = await ask(
        "You are an executive assistant prepping your principal for a meeting. " +
          "Output 3 short bullet points, no preamble. Each bullet: a concrete " +
          "fact, open thread, or thing to raise. If little is known, say so plainly.",
        `Meeting: ${e.subject}
When: ${e.start.dateTime}
Attendees: ${emails.join(", ") || "(none listed)"}
Location: ${e.location?.displayName || "—"}

Recent email with these people:
${recentForAI || "(none found)"}

Saved notes on these people:
${notesForAI || "(none)"}`,
        300
      );

      return {
        id: e.id,
        subject: e.subject,
        start: e.start.dateTime,
        end: e.end.dateTime,
        location: e.location?.displayName || "",
        joinUrl: e.onlineMeeting?.joinUrl || "",
        webLink: e.webLink || "",
        attendees: emails,
        people: Object.values(notes),
        recent: recent.map((m) => ({
          subject: m.subject,
          from: m.from?.emailAddress?.name || m.from?.emailAddress?.address,
          date: m.receivedDateTime,
        })),
        brief: brief
          ? brief
              .split("\n")
              .map((l) => l.replace(/^[-•*]\s*/, "").trim())
              .filter(Boolean)
          : [],
      };
    })
  );

  return NextResponse.json({ configured: true, meetings });
}
