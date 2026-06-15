import { NextResponse } from "next/server";
import { sbSelect, sbUpsert, sbDelete } from "@/lib/db";

export const dynamic = "force-dynamic";

type Person = {
  id: number;
  email: string;
  name: string | null;
  role: string | null;
  notes: string;
  updated_at: string;
};

export async function GET() {
  try {
    const rows = await sbSelect<Person>("ch_people?order=name.asc&select=*");
    return NextResponse.json({ success: true, people: rows });
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
    const email = String(b.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ success: false, error: "Email required" }, { status: 400 });
    await sbUpsert(
      "ch_people",
      {
        email,
        name: b.name || null,
        role: b.role || null,
        notes: b.notes || "",
        updated_at: new Date().toISOString(),
      },
      "email"
    );
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
    await sbDelete(`ch_people?id=eq.${encodeURIComponent(id)}`);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
