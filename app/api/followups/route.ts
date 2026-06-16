import { NextResponse } from "next/server";
import { sbSelect, sbUpdate, sbInsert } from "@/lib/db";
import { detectOpenLoops } from "@/lib/followups";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// GET: detect open loops, minus anything snoozed/dismissed.
export async function GET() {
  try {
    const open = await detectOpenLoops();

    const stored = await sbSelect<{ conversation_id: string; status: string; snooze_until: string | null }>(
      `ch_followups?select=conversation_id,status,snooze_until`
    ).catch(() => []);
    const state: Record<string, { status: string; snooze_until: string | null }> = {};
    for (const s of stored) if (s.conversation_id) state[s.conversation_id] = { status: s.status, snooze_until: s.snooze_until };

    const now = Date.now();
    const visible = open.filter((o) => {
      const st = state[o.conversation_id];
      if (!st) return true;
      if (st.status === "done") return false;
      if (st.status === "snoozed" && st.snooze_until && new Date(st.snooze_until).getTime() > now) return false;
      return true;
    });

    return NextResponse.json({
      success: true,
      waiting_on_them: visible.filter((o) => o.direction === "waiting_on_them"),
      waiting_on_you: visible.filter((o) => o.direction === "waiting_on_you"),
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

// POST: mark done or snooze.
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const cid = b.conversation_id;
    if (!cid) return NextResponse.json({ success: false, error: "conversation_id required" }, { status: 400 });

    let status = "done";
    let snooze_until: string | null = null;
    if (b.action === "snooze") {
      status = "snoozed";
      const days = Number(b.days) || 3;
      snooze_until = new Date(Date.now() + days * 86400000).toISOString();
    }

    const existing = await sbSelect<{ id: number }>(`ch_followups?conversation_id=eq.${encodeURIComponent(cid)}&select=id`);
    if (existing.length) {
      await sbUpdate(`ch_followups?conversation_id=eq.${encodeURIComponent(cid)}`, { status, snooze_until });
    } else {
      await sbInsert("ch_followups", {
        conversation_id: cid,
        direction: b.direction || null,
        counterpart: b.counterpart || null,
        subject: b.subject || null,
        status,
        snooze_until,
        created_at: new Date().toISOString(),
      });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
