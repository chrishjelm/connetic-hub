import { NextResponse } from "next/server";
import { detectOpenLoops } from "@/lib/followups";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/followups
// Returns open loops detected from recent sent + received mail:
//   - waiting_on_you: they replied, ball is in your court (>= WAIT_DAYS)
//   - waiting_on_them: you replied, awaiting them (>= WAIT_DAYS)
// The inbox page uses waiting_on_you to populate the Follow-up tab.
export async function GET() {
  try {
    const loops = await detectOpenLoops();
    return NextResponse.json({ success: true, loops });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
