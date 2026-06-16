import { NextResponse } from "next/server";
import { getSettings, sbSelect } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRAPH = "https://graph.microsoft.com/v1.0/me";
const CLIENT_ID =
  process.env.AZURE_CLIENT_ID || process.env.DYNAMICS_CLIENT_ID || "";
const CLIENT_SECRET =
  process.env.AZURE_CLIENT_SECRET || process.env.DYNAMICS_CLIENT_SECRET || "";
const TENANT =
  process.env.AZURE_TENANT_ID || process.env.DYNAMICS_TENANT_ID || "organizations";

const SCOPE =
  "offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite Files.Read.All Sites.Read.All People.Read";

async function getToken(): Promise<string> {
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
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

function authH(t: string) {
  return { Authorization: `Bearer ${t}` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safe(fn: () => Promise<any>, fallback: any) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function askClaude(prompt: string, maxTokens: number): Promise<string> {
  const ar = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!ar.ok) throw new Error(`anthropic ${ar.status}`);
  const ad = await ar.json();
  return (ad.content || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((x: any) => x.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((x: any) => x.text)
    .join("")
    .trim();
}

export async function GET() {
  try {
    const t = await getToken();
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfWindow = new Date(now);
    endOfWindow.setDate(endOfWindow.getDate() + 1);
    endOfWindow.setHours(23, 59, 59, 0);

    // --- Calendar: today + tomorrow ---
    const calendar = await safe(async () => {
      const r = await fetch(
        `${GRAPH}/calendarView?startDateTime=${startOfDay.toISOString()}&endDateTime=${endOfWindow.toISOString()}&$select=subject,start,end,location,isAllDay,onlineMeeting,attendees&$orderby=start/dateTime&$top=20`,
        { headers: { ...authH(t), Prefer: 'outlook.timezone="Eastern Standard Time"' } }
      );
      if (!r.ok) return [];
      const d = await r.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (d.value || []).map((e: any) => ({
        subject: e.subject,
        start: e.start?.dateTime,
        end: e.end?.dateTime,
        allDay: e.isAllDay,
        location: e.location?.displayName || "",
        online: !!e.onlineMeeting?.joinUrl,
        attendees: (e.attendees || [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((a: any) => a.emailAddress?.name)
          .filter(Boolean)
          .slice(0, 5),
      }));
    }, []);

    // --- Recent documents (OneDrive/SharePoint) ---
    const docs = await safe(async () => {
      const r = await fetch(`${GRAPH}/drive/recent?$top=8`, {
        headers: authH(t),
      });
      if (!r.ok) return [];
      const d = await r.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (d.value || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((f: any) => f.name)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((f: any) => ({
          name: f.name,
          url: f.webUrl,
          modified: f.lastModifiedDateTime,
        }))
        .slice(0, 6);
    }, []);

    // --- Recent sent mail ---
    const sent = await safe(async () => {
      const r = await fetch(
        `${GRAPH}/mailFolders/sentitems/messages?$top=5&$orderby=sentDateTime desc&$select=subject,toRecipients,sentDateTime`,
        { headers: authH(t) }
      );
      if (!r.ok) return [];
      const d = await r.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (d.value || []).map((m: any) => ({
        subject: m.subject,
        to: m.toRecipients?.[0]?.emailAddress?.name || "",
        sent: m.sentDateTime,
      }));
    }, []);

    const settings = await safe(() => getSettings(), {
      quick_links: [],
      vips: [],
      priority_notes: "",
    });

    // VIP + standing-priority context that personalizes ranking.
    const vipList: string[] = Array.isArray(settings.vips)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        settings.vips.map((v: any) => (typeof v === "string" ? v : v?.name || v?.email)).filter(Boolean)
      : [];
    const priorityNotes: string = settings.priority_notes || "";

    // --- Priority inbox (ranked, personalized, with a suggested action) ---
    const priority = await safe(async () => {
      // Pull learned feedback: senders/patterns the user marked unhelpful.
      const badFeedback = await sbSelect<{ from_email: string; from_name: string; subject_keyword: string }>(
        `ch_priority_feedback?vote=eq.-1&select=from_email,from_name,subject_keyword&order=created_at.desc&limit=40`
      ).catch(() => []);
      const suppressedEmails = [...new Set(badFeedback.map((f) => f.from_email).filter(Boolean))];
      const suppressedKeywords = [...new Set(badFeedback.map((f) => f.subject_keyword).filter(Boolean))];

      const r = await fetch(
        `${GRAPH}/mailFolders/inbox/messages?$top=22&$orderby=receivedDateTime desc&$select=id,subject,from,bodyPreview,receivedDateTime,isRead`,
        { headers: authH(t) }
      );
      if (!r.ok) return [];
      const d = await r.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgs = (d.value || []).map((m: any) => ({
        id: m.id,
        from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "",
        fromEmail: m.from?.emailAddress?.address || "",
        subject: m.subject || "",
        preview: (m.bodyPreview || "").slice(0, 160),
        received: m.receivedDateTime,
        unread: m.isRead === false,
      }));
      if (!msgs.length) return [];
      const compact = msgs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((m: any, i: number) => `${i}. [${m.unread ? "unread" : "read"}] ${m.from} <${m.fromEmail}> | ${m.subject} | ${m.preview}`)
        .join("\n");
      const ctx = [
        vipList.length ? `People the owner especially cares about (treat as high priority): ${vipList.join(", ")}.` : "",
        priorityNotes ? `The owner's standing priorities: ${priorityNotes}` : "",
        suppressedEmails.length ? `The owner has indicated these senders are NOT worth surfacing (skip them unless truly urgent): ${suppressedEmails.slice(0, 15).join(", ")}.` : "",
        suppressedKeywords.length ? `The owner has indicated messages about these topics are NOT useful to surface: ${suppressedKeywords.slice(0, 10).join(", ")}.` : "",
      ].filter(Boolean).join("\n");
      const raw = await askClaude(
        `You are Chris Hjelm's chief of staff at Connetic Ventures (VCAFX fund). From the inbox below, pick ONLY the messages that genuinely need Chris today — a real person awaiting his reply, something time-sensitive, money/contracts/deals, or anyone in his VIP list. Ignore newsletters, promotions, receipts, automated noise, and meeting reminders where no response is needed.
${ctx ? "\n" + ctx + "\n" : ""}
For each one return: "i" (its number), "reason" (4-8 words on why it matters), and "action" — use "reply" if Chris should respond, "review" if he should read/decide, "fyi" if just worth knowing. Order by importance, most urgent first. Max 6.
Return ONLY a JSON array: [{"i":0,"reason":"...","action":"reply"}]

${compact}`,
        600
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let picks: any[] = [];
      try {
        picks = JSON.parse(raw.replace(/```json|```/g, "").trim());
      } catch {
        picks = [];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return picks
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: any) => typeof p.i === "number" && msgs[p.i])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => ({ ...msgs[p.i], reason: p.reason, action: p.action || "review" }));
    }, []);

    // --- Morning brief ---
    const brief = await safe(async () => {
      const calLine = calendar.length
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? calendar.map((c: any) => `${c.subject} (${c.start})`).join("; ")
        : "no meetings";
      const mailLine = priority.length
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? priority.map((m: any) => `${m.from}: ${m.subject}`).join("; ")
        : "nothing urgent";
      return await askClaude(
        `You are Chris's chief of staff. In ONE punchy sentence (max ~25 words, no greeting), tell him the shape of his day and the single most important thing to handle. Be specific and direct — name the meeting or person if it matters. If nothing is pressing, say so plainly.\n\nToday's meetings: ${calLine}\nNeeds attention: ${mailLine}`,
        150
      );
    }, "");

    return NextResponse.json({
      success: true,
      brief,
      calendar,
      docs,
      sent,
      priority,
      quick_links: settings.quick_links || [],
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
