import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRAPH = "https://graph.microsoft.com/v1.0/me";
const CLIENT_ID =
  process.env.AZURE_CLIENT_ID || process.env.DYNAMICS_CLIENT_ID || "";
const CLIENT_SECRET =
  process.env.AZURE_CLIENT_SECRET || process.env.DYNAMICS_CLIENT_SECRET || "";
const TENANT =
  process.env.AZURE_TENANT_ID || process.env.DYNAMICS_TENANT_ID || "organizations";

async function getToken(scope: string): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: process.env.OUTLOOK_REFRESH_TOKEN!,
        grant_type: "refresh_token",
        scope,
      }),
    }
  );
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token as string;
}

async function probe(label: string, url: string, token: string) {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const t = await r.text();
      return { [label]: `FAILED ${r.status}: ${t.slice(0, 120)}` };
    }
    const d = await r.json();
    const count = Array.isArray(d.value) ? d.value.length : d.value ? 1 : 0;
    return { [label]: `OK (${count} items)` };
  } catch (e) {
    return { [label]: `ERROR ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function GET() {
  try {
    const token = await getToken(
      "offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite Files.Read.All Sites.Read.All People.Read"
    );
    const results = Object.assign(
      {},
      await probe("calendar", `${GRAPH}/events?$top=1`, token),
      await probe("files", `${GRAPH}/drive/recent?$top=1`, token),
      await probe("people", `${GRAPH}/people?$top=1`, token),
      await probe("mail", `${GRAPH}/mailFolders/inbox/messages?$top=1`, token)
    );
    return NextResponse.json({ success: true, scopes_live: results });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
