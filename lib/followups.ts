import { graphToken, gh, GRAPH } from "@/lib/graph";

const WAIT_DAYS = 3;

function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

export type OpenLoop = {
  conversation_id: string;
  direction: "waiting_on_them" | "waiting_on_you";
  counterpart: string;
  subject: string;
  last_activity: string;
  days: number;
};

// Detect open loops from recent sent + received mail.
export async function detectOpenLoops(token?: string): Promise<OpenLoop[]> {
  const t = token || (await graphToken());

  const [sentR, inboxR] = await Promise.all([
    fetch(
      `${GRAPH}/mailFolders/sentitems/messages?$top=40&$orderby=sentDateTime desc&$select=conversationId,subject,toRecipients,sentDateTime`,
      { headers: gh(t) }
    ),
    fetch(
      `${GRAPH}/mailFolders/inbox/messages?$top=40&$orderby=receivedDateTime desc&$select=conversationId,subject,from,receivedDateTime`,
      { headers: gh(t) }
    ),
  ]);
  const sent = sentR.ok ? (await sentR.json()).value || [] : [];
  const inbox = inboxR.ok ? (await inboxR.json()).value || [] : [];

  type Conv = {
    conversationId: string;
    counterpart: string;
    lastFromMe?: string;
    lastToMe?: string;
    lastSubject: string;
  };
  const convs: Record<string, Conv> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of sent as any[]) {
    const cid = m.conversationId;
    if (!cid) continue;
    const who = m.toRecipients?.[0]?.emailAddress?.name || m.toRecipients?.[0]?.emailAddress?.address || "";
    if (!convs[cid]) convs[cid] = { conversationId: cid, counterpart: who, lastSubject: m.subject || "" };
    if (!convs[cid].lastFromMe || m.sentDateTime > convs[cid].lastFromMe!) {
      convs[cid].lastFromMe = m.sentDateTime;
      convs[cid].counterpart = who || convs[cid].counterpart;
      convs[cid].lastSubject = m.subject || convs[cid].lastSubject;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of inbox as any[]) {
    const cid = m.conversationId;
    if (!cid) continue;
    const who = m.from?.emailAddress?.name || m.from?.emailAddress?.address || "";
    if (!convs[cid]) convs[cid] = { conversationId: cid, counterpart: who, lastSubject: m.subject || "" };
    if (!convs[cid].lastToMe || m.receivedDateTime > convs[cid].lastToMe!) {
      convs[cid].lastToMe = m.receivedDateTime;
      if (!convs[cid].counterpart) convs[cid].counterpart = who;
    }
  }

  const skip = /(noreply|no-reply|notifications|mailer|calendar|microsoft\.com|vercel\.com)/i;
  const open: OpenLoop[] = [];
  for (const c of Object.values(convs)) {
    if (!c.counterpart || skip.test(c.counterpart)) continue;
    const fromMe = c.lastFromMe ? new Date(c.lastFromMe).getTime() : 0;
    const toMe = c.lastToMe ? new Date(c.lastToMe).getTime() : 0;

    if (fromMe > toMe && c.lastFromMe && daysAgo(c.lastFromMe) >= WAIT_DAYS) {
      open.push({
        conversation_id: c.conversationId,
        direction: "waiting_on_them",
        counterpart: c.counterpart,
        subject: c.lastSubject,
        last_activity: c.lastFromMe,
        days: Math.floor(daysAgo(c.lastFromMe)),
      });
    } else if (toMe > fromMe && c.lastToMe && daysAgo(c.lastToMe) >= WAIT_DAYS) {
      open.push({
        conversation_id: c.conversationId,
        direction: "waiting_on_you",
        counterpart: c.counterpart,
        subject: c.lastSubject,
        last_activity: c.lastToMe,
        days: Math.floor(daysAgo(c.lastToMe)),
      });
    }
  }
  open.sort((a, b) => b.days - a.days);
  return open;
}
