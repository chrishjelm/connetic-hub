// lib/graph.ts
// Microsoft Graph access for connetic-hub, using a DELEGATED refresh token
// (so it acts as you, not app-wide). Mirrors how the Gmail side gets its fuel.
//
// Required Vercel env vars:
//   MS_TENANT_ID       - Azure AD tenant (directory) ID
//   MS_CLIENT_ID       - the connetic-hub app registration client ID
//                        (c3536241-3460-4a05-a6db-3738d05c500c)
//   MS_CLIENT_SECRET   - a client secret for that app registration
//   MS_REFRESH_TOKEN   - a refresh token obtained once via the OAuth consent
//                        flow with scopes: offline_access Calendars.ReadWrite Mail.Read
//
// The app registration needs delegated permissions:
//   Calendars.ReadWrite, Mail.Read, offline_access, User.Read

const TENANT = process.env.MS_TENANT_ID || "";
const CLIENT_ID = process.env.MS_CLIENT_ID || "";
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET || "";
const REFRESH_TOKEN = process.env.MS_REFRESH_TOKEN || "";

const GRAPH = "https://graph.microsoft.com/v1.0";

// ---- token cache (per warm lambda) -----------------------------------------
let cachedToken = "";
let cachedExp = 0;

export function graphConfigured(): boolean {
  return Boolean(TENANT && CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
}

async function getToken(): Promise<string> {
  if (!graphConfigured()) {
    throw new Error(
      "Microsoft Graph is not configured. Set MS_TENANT_ID, MS_CLIENT_ID, " +
        "MS_CLIENT_SECRET and MS_REFRESH_TOKEN in Vercel."
    );
  }
  const now = Date.now();
  if (cachedToken && now < cachedExp - 60_000) return cachedToken;

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: REFRESH_TOKEN,
    scope: "offline_access Calendars.ReadWrite Mail.Read User.Read",
  });

  const r = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    }
  );
  if (!r.ok) throw new Error(`MS token ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cachedToken = j.access_token;
  cachedExp = now + j.expires_in * 1000;
  return cachedToken;
}

async function graph<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const r = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // ask Graph to render times in Eastern so the UI doesn't have to guess
      Prefer: 'outlook.timezone="Eastern Standard Time"',
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`graph ${path} ${r.status}: ${await r.text()}`);
  if (r.status === 204) return undefined as unknown as T;
  return (await r.json()) as T;
}

// ---- types -----------------------------------------------------------------
export interface GEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string } | null;
  organizer?: { emailAddress?: { name?: string; address?: string } };
  attendees?: {
    type?: string;
    emailAddress?: { name?: string; address?: string };
  }[];
  webLink?: string;
}

export interface GMessage {
  id: string;
  subject: string;
  bodyPreview?: string;
  conversationId?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
}

// ---- calendar --------------------------------------------------------------
export async function getCalendarView(
  startISO: string,
  endISO: string,
  top = 50
): Promise<GEvent[]> {
  const qs = new URLSearchParams({
    startDateTime: startISO,
    endDateTime: endISO,
    $orderby: "start/dateTime",
    $top: String(top),
    $select:
      "id,subject,bodyPreview,start,end,location,isAllDay,isCancelled,isOnlineMeeting,onlineMeeting,organizer,attendees,webLink",
  });
  const j = await graph<{ value: GEvent[] }>(`/me/calendarView?${qs}`);
  return j.value || [];
}

// recent messages exchanged with a given person (either direction)
export async function messagesWith(
  email: string,
  top = 4
): Promise<GMessage[]> {
  // KQL search over participants; quote the address
  const qs = new URLSearchParams({
    $search: `"participants:${email}"`,
    $top: String(top),
    $select: "subject,from,receivedDateTime,bodyPreview,conversationId",
  });
  try {
    const j = await graph<{ value: GMessage[] }>(`/me/messages?${qs}`);
    return j.value || [];
  } catch {
    return [];
  }
}

// ---- sent mail / follow-ups ------------------------------------------------
export async function recentSent(top = 25): Promise<GMessage[]> {
  const qs = new URLSearchParams({
    $top: String(top),
    $orderby: "sentDateTime desc",
    $select:
      "id,subject,toRecipients,conversationId,sentDateTime,bodyPreview,from",
  });
  const j = await graph<{ value: GMessage[] }>(
    `/me/mailFolders/sentitems/messages?${qs}`
  );
  return j.value || [];
}

// is there an inbound reply in this conversation after `afterISO`,
// from someone other than `me`?
export async function hasReplyAfter(
  conversationId: string,
  afterISO: string,
  me: string
): Promise<boolean> {
  const qs = new URLSearchParams({
    $filter: `conversationId eq '${conversationId}'`,
    $select: "from,receivedDateTime",
    $top: "25",
  });
  try {
    const j = await graph<{ value: GMessage[] }>(`/me/messages?${qs}`);
    const after = new Date(afterISO).getTime();
    return (j.value || []).some((m) => {
      const addr = m.from?.emailAddress?.address?.toLowerCase() || "";
      const t = m.receivedDateTime ? new Date(m.receivedDateTime).getTime() : 0;
      return addr && addr !== me.toLowerCase() && t > after;
    });
  } catch {
    // if we can't tell, assume no reply so it surfaces rather than hides
    return false;
  }
}

// ---- scheduling ------------------------------------------------------------
export interface TimeSlot {
  start: string; // ISO
  end: string; // ISO
  confidence?: number;
}

export async function findMeetingTimes(
  attendeeEmails: string[],
  durationMinutes: number,
  windowStartISO: string,
  windowEndISO: string,
  maxCandidates = 6
): Promise<TimeSlot[]> {
  const payload = {
    attendees: attendeeEmails.map((address) => ({
      type: "required",
      emailAddress: { address },
    })),
    timeConstraint: {
      activityDomain: "work",
      timeSlots: [
        {
          start: { dateTime: windowStartISO, timeZone: "Eastern Standard Time" },
          end: { dateTime: windowEndISO, timeZone: "Eastern Standard Time" },
        },
      ],
    },
    meetingDuration: `PT${durationMinutes}M`,
    maxCandidates,
    isOrganizerOptional: false,
    returnSuggestionReasons: true,
    minimumAttendeePercentage: 100,
  };
  const j = await graph<{
    meetingTimeSuggestions: {
      confidence: number;
      meetingTimeSlot: { start: { dateTime: string }; end: { dateTime: string } };
    }[];
  }>(`/me/findMeetingTimes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return (j.meetingTimeSuggestions || []).map((s) => ({
    start: s.meetingTimeSlot.start.dateTime,
    end: s.meetingTimeSlot.end.dateTime,
    confidence: s.confidence,
  }));
}

export async function createMeeting(opts: {
  subject: string;
  startISO: string;
  endISO: string;
  attendeeEmails: string[];
  body?: string;
  online?: boolean;
}): Promise<{ id: string; webLink: string; joinUrl?: string }> {
  const payload: Record<string, unknown> = {
    subject: opts.subject,
    start: { dateTime: opts.startISO, timeZone: "Eastern Standard Time" },
    end: { dateTime: opts.endISO, timeZone: "Eastern Standard Time" },
    attendees: opts.attendeeEmails.map((address) => ({
      type: "required",
      emailAddress: { address },
    })),
    body: { contentType: "HTML", content: opts.body || "" },
  };
  if (opts.online !== false) {
    payload.isOnlineMeeting = true;
    payload.onlineMeetingProvider = "teamsForBusiness";
  }
  const ev = await graph<GEvent>(`/me/events`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return {
    id: ev.id,
    webLink: ev.webLink || "",
    joinUrl: ev.onlineMeeting?.joinUrl,
  };
}
