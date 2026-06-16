// ============================================================
// connetic-hub — INBOX TAB + STATUS LOGIC (client-side)
// Import into your inbox page component. The API persists nothing,
// so status is derived from what analyze/prioritize already return,
// plus a local record of actions you've taken this session.
// ============================================================

export type MailStatus =
  | "none"
  | "needsReply"
  | "draftReady"
  | "forwardSuggested"
  | "done";

export type TabKey = "all" | "important" | "followup" | "queue";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "important", label: "Important" },
  { key: "followup", label: "Follow-up" },
  { key: "queue", label: "AI Queue" },
];

// What the page tracks per email. priority comes from `prioritize`;
// recommended/forwardSuggested come from `analyze`; the rest are set
// as you act (a draft gets generated, you approve, etc.).
export type MailMeta = {
  id: string;
  priority?: "high" | "medium" | "low";
  recommended?: "reply" | "archive" | "unsubscribe" | "keep";
  forwardSuggested?: { recipient: string; email: string }[];
  hasDraft?: boolean; // a reply has been generated, awaiting your send
  acted?: boolean;    // you sent / forwarded / archived -> done
};

// One email, exactly one status. Order matters: `done` and `draftReady`
// are terminal/explicit states that override the recommendation.
export function deriveStatus(m: MailMeta): MailStatus {
  if (m.acted) return "done";
  if (m.hasDraft) return "draftReady";
  if (m.forwardSuggested && m.forwardSuggested.length > 0)
    return "forwardSuggested";
  if (m.recommended === "reply") return "needsReply";
  return "none";
}

// Tab membership. Important is the urgency axis (independent of status);
// an email can be both Important and Follow-up — that's intended.
// The action pipeline (Follow-up -> AI Queue -> done) is where we avoid
// duplication: a given email sits in exactly one of those at a time.
export function inTab(tab: TabKey, m: MailMeta): boolean {
  const status = deriveStatus(m);
  switch (tab) {
    case "all":
      return true; // `done` stays here; it only clears the action tabs
    case "important":
      return m.priority === "high";
    case "followup":
      return status === "needsReply";
    case "queue":
      return status === "draftReady" || status === "forwardSuggested";
  }
}

// Convenience: count badges per tab.
export function tabCounts(metas: MailMeta[]): Record<TabKey, number> {
  return {
    all: metas.length,
    important: metas.filter((m) => inTab("important", m)).length,
    followup: metas.filter((m) => inTab("followup", m)).length,
    queue: metas.filter((m) => inTab("queue", m)).length,
  };
}

// Left-accent stripe color for a row, by priority. Wire into row style.
export function rowAccent(priority?: string): string {
  if (priority === "high") return "#f59e0b"; // amber
  if (priority === "medium") return "#cbd5e1"; // slate-300
  return "transparent";
}
