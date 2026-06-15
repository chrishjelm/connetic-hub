import { NextResponse } from "next/server";

// Reuses the existing connetic-hub Azure app registration (the one set up
// for Dynamics). Falls back to AZURE_* names if you ever rename them.
const CLIENT_ID =
  process.env.AZURE_CLIENT_ID || process.env.DYNAMICS_CLIENT_ID || "";
const CLIENT_SECRET =
  process.env.AZURE_CLIENT_SECRET || process.env.DYNAMICS_CLIENT_SECRET || "";
const TENANT =
  process.env.AZURE_TENANT_ID || process.env.DYNAMICS_TENANT_ID || "organizations";

const REDIRECT_URI = "https://connetic-hub.vercel.app/api/outlook-auth";
// Delegated scopes: read/modify mail, send mail, and offline_access for a
// durable refresh token.
const SCOPES = "offline_access User.Read Mail.ReadWrite Mail.Send";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  // Microsoft bounced back with an error (often the consent wall).
  if (error) {
    return new NextResponse(
      `<pre style="font-family:system-ui;max-width:760px;margin:40px auto;white-space:pre-wrap;">` +
        `Sign-in failed:\n\n${error}\n\n${errorDesc || ""}</pre>`,
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  // Step 1 — no code yet: send the user to the Microsoft sign-in page.
  if (!code) {
    const authUrl = new URL(
      `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`
    );
    authUrl.searchParams.set("client_id", CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_mode", "query");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("prompt", "consent");
    return NextResponse.redirect(authUrl.toString());
  }

  // Step 2 — code present: exchange it for tokens.
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
        scope: SCOPES,
      }),
    }
  );
  const data = await res.json();

  if (!res.ok || !data.refresh_token) {
    return new NextResponse(
      `<pre style="font-family:system-ui;max-width:760px;margin:40px auto;white-space:pre-wrap;">` +
        `Token exchange failed:\n\n${JSON.stringify(data, null, 2)}</pre>`,
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }

  return new NextResponse(
    `<html><body style="font-family:system-ui;max-width:760px;margin:40px auto;line-height:1.5;">
      <h2>&#9989; Outlook connected</h2>
      <p>Copy this value into Vercel as <code>OUTLOOK_REFRESH_TOKEN</code> (Production), then redeploy:</p>
      <textarea readonly style="width:100%;height:140px;font-family:monospace;" onclick="this.select()">${data.refresh_token}</textarea>
      <p style="color:#666;">Click the box to select all. Close this tab when done &mdash; don't share this token.</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
