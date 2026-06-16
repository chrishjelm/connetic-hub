// lib/assist.ts
// Small shared helpers used by the cockpit routes:
//   - peopleContext(): pull your saved notes on people from ch_people
//   - ask(): a thin server-side Claude call for briefs and nudge drafts
// Both are best-effort: if the relevant env var is missing, they degrade
// gracefully so the feature still returns useful (just less smart) data.

const SB_URL = process.env.SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

export interface PersonNote {
  email: string;
  name?: string;
  role?: string;
  notes?: string;
}

// Look up saved context for a set of email addresses (lowercased match).
export async function peopleContext(
  emails: string[]
): Promise<Record<string, PersonNote>> {
  const out: Record<string, PersonNote> = {};
  if (!SB_URL || !SB_KEY || emails.length === 0) return out;
  const list = emails
    .map((e) => `"${e.toLowerCase()}"`)
    .join(",");
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/ch_people?email=in.(${encodeURIComponent(list)})&select=email,name,role,notes`,
      {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        cache: "no-store",
      }
    );
    if (r.ok) {
      for (const p of (await r.json()) as PersonNote[]) {
        out[p.email.toLowerCase()] = p;
      }
    }
  } catch {
    /* ignore — return what we have */
  }
  return out;
}

// One-shot Claude call. Returns "" if no API key (callers handle the fallback).
export async function ask(
  system: string,
  user: string,
  maxTokens = 400
): Promise<string> {
  if (!ANTHROPIC_KEY) return "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
      cache: "no-store",
    });
    if (!r.ok) return "";
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    return (j.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("\n")
      .trim();
  } catch {
    return "";
  }
}
