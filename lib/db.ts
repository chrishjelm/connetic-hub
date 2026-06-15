// Minimal Supabase REST helper (server-side only — uses the service key).
// No SDK dependency; just fetch against PostgREST.

const URL = process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_KEY || "";

function headers() {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  };
}

// GET rows. pathAndQuery e.g. "ch_settings?id=eq.1"
export async function sbSelect<T = unknown>(
  pathAndQuery: string
): Promise<T[]> {
  const r = await fetch(`${URL}/rest/v1/${pathAndQuery}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`supabase select ${r.status}: ${await r.text()}`);
  return (await r.json()) as T[];
}

// PATCH rows. pathAndQuery e.g. "ch_settings?id=eq.1"
export async function sbUpdate(
  pathAndQuery: string,
  body: Record<string, unknown>
): Promise<void> {
  const r = await fetch(`${URL}/rest/v1/${pathAndQuery}`, {
    method: "PATCH",
    headers: { ...headers(), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`supabase update ${r.status}: ${await r.text()}`);
}

// INSERT a row.
export async function sbInsert(
  table: string,
  body: Record<string, unknown>
): Promise<void> {
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`supabase insert ${r.status}: ${await r.text()}`);
}

// UPSERT a row (on conflict do update). Pass on_conflict column.
export async function sbUpsert(
  table: string,
  body: Record<string, unknown>,
  onConflict: string
): Promise<void> {
  const r = await fetch(
    `${URL}/rest/v1/${table}?on_conflict=${onConflict}`,
    {
      method: "POST",
      headers: {
        ...headers(),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(body),
    }
  );
  if (!r.ok) throw new Error(`supabase upsert ${r.status}: ${await r.text()}`);
}

// DELETE rows. pathAndQuery e.g. "ch_people?id=eq.5"
export async function sbDelete(pathAndQuery: string): Promise<void> {
  const r = await fetch(`${URL}/rest/v1/${pathAndQuery}`, {
    method: "DELETE",
    headers: { ...headers(), Prefer: "return=minimal" },
  });
  if (!r.ok) throw new Error(`supabase delete ${r.status}: ${await r.text()}`);
}

export type Settings = {
  id: number;
  auto_send: boolean;
  auto_unsubscribe: boolean;
  scan_limit: number;
  vips: string[];
  priority_notes: string;
  quick_links: { label: string; url: string }[];
};

export async function getSettings(): Promise<Settings> {
  const rows = await sbSelect<Settings>("ch_settings?id=eq.1");
  return rows[0];
}
