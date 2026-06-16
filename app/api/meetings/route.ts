import { NextRequest, NextResponse } from "next/server";
import { graphToken, gh, GRAPH } from "@/lib/graph";
import { sbSelect } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ME = (process.env.MS_USER_EMAIL || "hjelm@conneticventures.com").toLowerCase();

async function askClaude(system: string, user: string, maxTokens: number): Promise<string> {
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
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) return "";
  const d = await r.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (d.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("").trim();
}

export async function GET(req: NextRequest) {
  try {
    const token = await graphToken();
    const days = Math.min(14, Math.max(1, Number(req.nextUrl.searchParams.get("days") || "2")));
    const now = new Date();
    const end = new Date(now.getTime() + days * 24 * 3600 * 1000);

    // Fetch calendar events
    const calR = await fetch(
      `${GRAPH}/calendarView?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}&$top=20&$select=id,subject,start,end,location,attendees,organizer,onlineMeeting,webLink,isCancelled,isAllDay`,
      { headers: gh(token) }
    );
    if (!calR.ok) return NextResponse.json({ error: "Calendar fetch failed" }, { status: 502 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: any[] = (await calR.json()).value || [];

    // Filter to meetings worth prepping for
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const worthy = events.filter((e: any) => {
      if (e.isCancelled || e.isAllDay) return false;
      const others = (e.attendees || []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any) => (a.emailAddress?.address || "").toLowerCase() !== ME
      );
      return others.length > 0;
    }).slice(0, 6);

    // For each meeting, pull recent mail with attendees + people notes, then brief
    const meetings = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      worthy.map(async (e: any) => {
        // Collect attendee emails
        const emails: string[] = [];
        const org = e.organizer?.emailAddress?.address?.toLowerCase();
        if (org && org !== ME) emails.push(org);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const a of (e.attendees || [])) {
          const addr = a.emailAddress?.address?.toLowerCase();
          if (addr && addr !== ME && !emails.includes(addr)) emails.push(addr);
        }

        // Pull recent mail with attendees (first 2 only, for speed)
        const recentMail: string[] = [];
        for (const addr of emails.slice(0, 2)) {
          const mR = await fetch(
            `${GRAPH}/messages?$search="from:${addr}"&$top=3&$select=subject,from,bodyPreview,receivedDateTime`,
            { headers: gh(token) }
          ).catch(() => null);
          if (mR?.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msgs: any[] = (await mR.json()).value || [];
            for (const m of msgs) {
              recentMail.push(`(${(m.receivedDateTime || "").slice(0, 10)}) ${m.from?.emailAddress?.name || addr}: ${m.subject} — ${(m.bodyPreview || "").slice(0, 120)}`);
            }
          }
        }

        // Pull people notes from DB
        const people = emails.length
          ? await sbSelect<{ name: string; role: string; notes: string; email: string }>(
              `ch_people?email=in.(${emails.map(e => `"${e}"`).join(",")})&select=name,role,notes,email`
            ).catch(() => [])
          : [];
        const notesText = people.map(p => `- ${p.name || p.email}${p.role ? ` (${p.role})` : ""}: ${p.notes || "(no notes)"}`).join("\n");

        // Brief from Claude
        const brief = await askClaude(
          "You are an executive assistant prepping your principal for a meeting. Give 3 short bullet points — concrete facts, open threads, or things to raise. If little is known, say so plainly. No preamble.",
          `Meeting: ${e.subject}\nWhen: ${e.start?.dateTime}\nAttendees: ${emails.join(", ") || "(none)"}\n\nRecent email:\n${recentMail.join("\n") || "(none found)"}\n\nPeople notes:\n${notesText || "(none)"}`,
          300
        );

        return {
          id: e.id,
          subject: e.subject,
          start: e.start?.dateTime,
          end: e.end?.dateTime,
          location: e.location?.displayName || "",
          joinUrl: e.onlineMeeting?.joinUrl || "",
          attendees: emails,
          brief: brief ? brief.split("\n").map((l: string) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean) : [],
        };
      })
    );

    return NextResponse.json({ configured: true, meetings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
