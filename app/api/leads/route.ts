import { NextResponse } from "next/server";
import { sbSelect, sbInsert, sbUpdate, sbDelete } from "@/lib/db";

export const dynamic = "force-dynamic";

export type Lead = {
  id: number;
  type: "investor" | "startup";
  name: string;
  firm: string | null;
  email: string | null;
  stage: string;
  amount: string | null;
  next_step: string | null;
  notes: string;
  last_touch: string | null;
  updated_at: string;
};

// GET /api/leads?type=investor   (or startup, or omit for all)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const filter = type ? `type=eq.${encodeURIComponent(type)}&` : "";
    const rows = await sbSelect<Lead>(
      `ch_leads?${filter}order=updated_at.desc&select=*`
    );
    return NextResponse.json({ success: true, leads: rows });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

// POST create or update. If id present -> update, else insert.
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const now = new Date().toISOString();

    if (b.id) {
      const patch: Record<string, unknown> = { updated_at: now };
      for (const k of ["name", "firm", "email", "stage", "amount", "next_step", "notes", "last_touch", "type"]) {
        if (b[k] !== undefined) patch[k] = b[k];
      }
      await sbUpdate(`ch_leads?id=eq.${encodeURIComponent(b.id)}`, patch);
      return NextResponse.json({ success: true, id: b.id });
    }

    if (!b.type || !b.name) {
      return NextResponse.json({ success: false, error: "type and name required" }, { status: 400 });
    }
    await sbInsert("ch_leads", {
      type: b.type,
      name: b.name,
      firm: b.firm || null,
      email: b.email || null,
      stage: b.stage || (b.type === "startup" ? "Sourced" : "Identified"),
      amount: b.amount || null,
      next_step: b.next_step || null,
      notes: b.notes || "",
      last_touch: b.last_touch || now,
      created_at: now,
      updated_at: now,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    await sbDelete(`ch_leads?id=eq.${encodeURIComponent(id)}`);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
