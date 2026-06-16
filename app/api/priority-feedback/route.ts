import { NextResponse } from "next/server";
import { sbInsert } from "@/lib/db";
import { graphToken, gh, GRAPH } from "@/lib/graph";

export const dynamic = "force-dynamic";

function firstKeyword(subject: string): string {
  // Pull first meaningful word from subject for pattern suppression.
  const stop = new Set(["re:", "fw:", "fwd:", "the", "a", "an", "and", "or", "for", "of", "in", "on", "to", "is"]);
  const words = subject.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
  return words.find((w) => w.length > 2 && !stop.has(w)) || subject.slice(0, 20);
}

// POST: record feedback (vote) or perform an action (archive, markRead).
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const { action, messageId, fromEmail, fromName, subject, vote } = b;

    // --- Record thumbs feedback ---
    if (action === "feedback" && messageId && typeof vote === "number") {
      await sbInsert("ch_priority_feedback", {
        from_email: fromEmail || "",
        from_name: fromName || "",
        subject_keyword: firstKeyword(subject || ""),
        vote,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true });
    }

    // --- Archive a message ---
    if (action === "archive" && messageId) {
      const token = await graphToken();
      const r = await fetch(`${GRAPH}/messages/${messageId}/move`, {
        method: "POST",
        headers: gh(token),
        body: JSON.stringify({ destinationId: "archive" }),
      });
      if (!r.ok) return NextResponse.json({ success: false, error: await r.text() }, { status: r.status });
      return NextResponse.json({ success: true });
    }

    // --- Mark as read (dismiss without archiving) ---
    if (action === "markRead" && messageId) {
      const token = await graphToken();
      const r = await fetch(`${GRAPH}/messages/${messageId}`, {
        method: "PATCH",
        headers: gh(token),
        body: JSON.stringify({ isRead: true }),
      });
      if (!r.ok) return NextResponse.json({ success: false, error: await r.text() }, { status: r.status });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
