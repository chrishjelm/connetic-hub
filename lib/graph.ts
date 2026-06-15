// Shared Microsoft Graph helpers (server-side).

const TENANT =
  process.env.AZURE_TENANT_ID || process.env.DYNAMICS_TENANT_ID || "organizations";
const CLIENT_ID =
  process.env.AZURE_CLIENT_ID || process.env.DYNAMICS_CLIENT_ID || "";
const CLIENT_SECRET =
  process.env.AZURE_CLIENT_SECRET || process.env.DYNAMICS_CLIENT_SECRET || "";

export const GRAPH = "https://graph.microsoft.com/v1.0/me";

const SCOPE =
  "offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite Files.Read.All Sites.Read.All People.Read";

export async function graphToken(): Promise<string> {
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
        scope: SCOPE,
      }),
    }
  );
  if (!res.ok) throw new Error(`graph token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

export function gh(t: string) {
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}
