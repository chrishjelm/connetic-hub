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

// True only when all three secrets needed to call Graph on the user's
// behalf are present. The /api/schedule route checks this before doing
// anything so it can fail soft instead of throwing at runtime.
export function graphConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && process.env.OUTLOOK_REFRESH_TOKEN);
}

// Find times when every attendee is free, using Graph's findMeetingTimes.
// Returns a normalized list of slots: { start, end, confidence }.
export async function findMeetingTimes(
  attendeeEmails: string[],
  durationMinutes: number,
  startISO: string,
  endISO: string
): Promise<{ start: string; end: string; confidence: number }[]> {
  const token = await graphToken();

  const payload = {
    attendees: attendeeEmails.map((address) => ({
      type: "required",
      emailAddress: { address },
    })),
    timeConstraint: {
      activityDomain: "work",
      timeSlots: [
        {
          start: { dateTime: startISO, timeZone: "UTC" },
          end: { dateTime: endISO, timeZone: "UTC" },
        },
      ],
    },
    meetingDuration: `PT${Math.round(durationMinutes)}M`,
    maxCandidates: 20,
    minimumAttendeePercentage: 100,
    isOrganizerOptional: false,
  };

  const res = await fetch(`${GRAPH}/findMeetingTimes`, {
    method: "POST",
    headers: gh(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok)
    throw new Error(`findMeetingTimes ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const suggestions = data.meetingTimeSuggestions || [];
  return suggestions.map((s: any) => ({
    start: s.meetingTimeSlot?.start?.dateTime,
    end: s.meetingTimeSlot?.end?.dateTime,
    confidence: s.confidence ?? 0,
  }));
}

// Create a calendar event (optionally a Teams online meeting) and invite
// the attendees. Returns the event id, its web link, and a join URL if online.
export async function createMeeting(opts: {
  subject: string;
  startISO: string;
  endISO: string;
  attendeeEmails: string[];
  body?: string;
  online?: boolean;
}): Promise<{ id: string; webLink: string; joinUrl: string | null }> {
  const token = await graphToken();

  const event: any = {
    subject: opts.subject,
    body: { contentType: "HTML", content: opts.body || "" },
    start: { dateTime: opts.startISO, timeZone: "UTC" },
    end: { dateTime: opts.endISO, timeZone: "UTC" },
    attendees: (opts.attendeeEmails || []).map((address) => ({
      emailAddress: { address },
      type: "required",
    })),
  };

  if (opts.online !== false) {
    event.isOnlineMeeting = true;
    event.onlineMeetingProvider = "teamsForBusiness";
  }

  const res = await fetch(`${GRAPH}/events`, {
    method: "POST",
    headers: gh(token),
    body: JSON.stringify(event),
  });
  if (!res.ok)
    throw new Error(`createMeeting ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return {
    id: data.id,
    webLink: data.webLink,
    joinUrl: data.onlineMeeting?.joinUrl || null,
  };
}
