// app/api/schedule/route.ts
// POST /api/schedule  { action: "suggest", attendees:[], durationMinutes, startISO, endISO }
//   -> { slots: [{start,end,confidence}] }
// POST /api/schedule  { action: "book", subject, startISO, endISO, attendees:[], body? }
//   -> { id, webLink, joinUrl }
//
// "suggest" finds times everyone is free (Graph findMeetingTimes).
// "book" creates the event with a Teams link. Booking is an explicit,
// separate call so nothing lands on anyone's calendar without a confirm.

import { NextRequest, NextResponse } from "next/server";
import {
  findMeetingTimes,
  createMeeting,
  graphConfigured,
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
      const slots = await findMeetingTimes(
        attendees,
        duration,
        startISO,
        endISO
      );
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
    { error: "Unknown action. Use 'suggest' or 'book'." },
    { status: 400 }
  );
}
