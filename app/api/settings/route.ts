import { NextResponse } from "next/server";
import { getSettings, sbUpdate } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ success: true, settings });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();

    // Only accept the fields the UI manages; ignore anything else.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = {};

    if (Array.isArray(b.vips)) {
      patch.vips = b.vips
        .map((v: unknown) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean);
    }
    if (typeof b.priority_notes === "string") {
      patch.priority_notes = b.priority_notes;
    }
    if (Array.isArray(b.quick_links)) {
      patch.quick_links = b.quick_links
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((l: any) => ({ label: String(l?.label || "").trim(), url: String(l?.url || "").trim() }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((l: any) => l.label && l.url);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    patch.updated_at = new Date().toISOString();
    await sbUpdate("ch_settings?id=eq.1", patch);

    const settings = await getSettings();
    return NextResponse.json({ success: true, settings });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
