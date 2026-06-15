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

    return NextResponse.json({ success: false, error: "Unknown proposal kind" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
