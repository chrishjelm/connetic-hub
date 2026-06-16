// app/api/schedule/route.ts
// POST /api/schedule  { action: "list", startISO?, endISO? }
//   -> { events: [{id, subject, start, end, isOnline, joinUrl, attendees, status}] }
// POST /api/schedule  { action: "suggest", attendees:[], durationMinutes, startISO, endISO }
//   -> { slots: [{start,end,confidence}] }
// POST /api/schedule  { action: "book", subject, startISO, endISO, attendees:[], body? }
//   -> { id, webLink, joinUrl }

import { NextRequest, NextResponse } from "next/server";
import {
  findMeetingTimes,
  createMeeting,
  graphConfigured,
  graphToken,
  gh,
  GRAPH,
} from "@/lib/graph";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!graphConfigured()) {
    return NextResponse.json(
      { configured: false, error: "Microsoft Graph not configured." },
      { status: 200 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action;

  if (action === "list") {
    const now = new Date();
    const startISO = body.startISO || new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const endISO =
      body.endISO ||
      new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    try {
      const token = await graphToken();
      const url =
        `${GRAPH}/calendarView?startDateTime=${encodeURIComponent(startISO)}&endDateTime=${encodeURIComponent(endISO)}` +
        `&$select=id,subject,start,end,isOnlineMeeting,onlineMeeting,attendees,showAs,responseStatus` +
        `&$orderby=start/dateTime&$top=50`;
      const res = await fetch(url, { headers: gh(token) });
      if (!res.ok)
        throw new Error(`calendar ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const events = (data.value || []).map((e: any) => ({
        id: e.id,
        subject: e.subject || "(No title)",
        start: e.start?.dateTime,
        startTz: e.start?.timeZone,
        end: e.end?.dateTime,
        isOnline: e.isOnlineMeeting || false,
        joinUrl: e.onlineMeeting?.joinUrl || null,
        attendees: (e.attendees || [])
          .filter((a: any) => a.type !== "resource")
          .map((a: any) => ({
            name: a.emailAddress?.name || a.emailAddress?.address,
            email: a.emailAddress?.address,
            status: a.status?.response,
          })),
        showAs: e.showAs,
        myStatus: e.responseStatus?.response,
      }));
      return NextResponse.json({ configured: true, events });
    } catch (e: any) {
      return NextResponse.json(
        { error: String(e.message || e) },
        { status: 502 }
      );
    }
  }

  if (action === "suggest") {
    const attendees: string[] = (body.attendees || []).filter(Boolean);
    const duration = Math.min(240, Math.max(15, Number(body.durationMinutes) || 30));
    const startISO =
      body.startISO || new Date(Date.now() + 3600 * 1000).toISOString();
    const endISO =
      body.endISO ||
      new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    if (attendees.length === 0) {
      return NextResponse.json(
        { error: "Add at least one attendee email." },
        { status: 400 }
      );
    }
    try {
      const slots = await findMeetingTimes(attendees, duration, startISO, endISO);
      return NextResponse.json({ configured: true, slots });
    } catch (e: any) {
      return NextResponse.json(
        { error: String(e.message || e) },
        { status: 502 }
      );
    }
  }

  if (action === "book") {
    const { subject, startISO, endISO } = body;
    const attendees: string[] = (body.attendees || []).filter(Boolean);
    if (!subject || !startISO || !endISO) {
      return NextResponse.json(
        { error: "subject, startISO and endISO are required." },
        { status: 400 }
      );
    }
    try {
      const result = await createMeeting({
        subject,
        startISO,
        endISO,
        attendeeEmails: attendees,
        body: body.body || "",
        online: body.online !== false,
      });
      return NextResponse.json({ configured: true, ...result });
    } catch (e: any) {
      return NextResponse.json(
        { error: String(e.message || e) },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    { error: "Unknown action. Use 'list', 'suggest' or 'book'." },
    { status: 400 }
  );
}
