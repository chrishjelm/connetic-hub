import { NextResponse } from "next/server";
import { graphToken, gh, GRAPH } from "@/lib/graph";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { proposal } = await req.json();
    if (!proposal) return NextResponse.json({ success: false, error: "No proposal" }, { status: 400 });
    const token = await graphToken();

    if (proposal.kind === "reply") {
      const r = await fetch(`${GRAPH}/messages/${proposal.message_id}/reply`, {
        method: "POST",
        headers: gh(token),
        body: JSON.stringify({ comment: proposal.body || "" }),
      });
      if (!r.ok) return NextResponse.json({ success: false, error: await r.text() }, { status: r.status });
      return NextResponse.json({ success: true });
    }

    if (proposal.kind === "email") {
      const to = String(proposal.to || "")
        .split(",")
        .map((a: string) => a.trim())
        .filter(Boolean)
        .map((address: string) => ({ emailAddress: { address } }));
      if (!to.length) return NextResponse.json({ success: false, error: "No recipient" }, { status: 400 });
      const r = await fetch(`${GRAPH}/sendMail`, {
        method: "POST",
        headers: gh(token),
        body: JSON.stringify({
          message: {
            subject: proposal.subject || "(no subject)",
            body: { contentType: "Text", content: proposal.body || "" },
            toRecipients: to,
          },
          saveToSentItems: true,
        }),
      });
      if (!r.ok) return NextResponse.json({ success: false, error: await r.text() }, { status: r.status });
      return NextResponse.json({ success: true });
    }

    if (proposal.kind === "meeting") {
      const attendees = String(proposal.attendees || "")
        .split(",")
        .map((a: string) => a.trim())
        .filter(Boolean)
        .map((address: string) => ({ emailAddress: { address }, type: "required" }));
      // strip any trailing Z/offset; we send local Eastern + timeZone
      const clean = (s: string) => String(s || "").replace(/(Z|[+-]\d{2}:?\d{2})$/, "");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const event: any = {
        subject: proposal.subject || "(no subject)",
        start: { dateTime: clean(proposal.start), timeZone: "Eastern Standard Time" },
        end: { dateTime: clean(proposal.end), timeZone: "Eastern Standard Time" },
        attendees,
        body: { contentType: "Text", content: proposal.body || "" },
      };
      if (proposal.online !== false) {
        event.isOnlineMeeting = true;
        event.onlineMeetingProvider = "teamsForBusiness";
      }
      const r = await fetch(`${GRAPH}/events`, {
        method: "POST",
        headers: gh(token),
        body: JSON.stringify(event),
      });
      if (!r.ok) return NextResponse.json({ success: false, error: await r.text() }, { status: r.status });
      const created = await r.json();
      return NextResponse.json({ success: true, joinUrl: created.onlineMeeting?.joinUrl || "" });
    }

    return NextResponse.json({ success: false, error: "Unknown proposal kind" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
