// ============================================================
// connetic-hub — ORG FORWARD RULES (Outlook control center)
// Imported by app/api/outlook-mail/route.ts (the `analyze` action
// and the `forward` action). This is SEPARATE from lib/routing.ts,
// which configures the Gmail cron engine. Edit recipients here.
// ============================================================

export type ForwardRule = {
  recipient: string;
  email: string;
  keywords: string[]; // matched case-insensitively against subject + body
  priority: number;   // lower = more specific, evaluated first
};

// Most-specific-first. Lower priority number wins a tie.
// NOTE: "VCAFX" is intentionally NOT a sole keyword — it maps to both
// Brad and Lily depending on context, so it's handled separately below
// and surfaces BOTH as suggestions for you to pick in the AI Queue.
export const FORWARD_RULES: ForwardRule[] = [
  {
    recipient: "Dawna Stoops",
    email: "dstoops@wendal.com",
    keywords: ["marketing list", "microsoft dynamics", "dynamics"],
    priority: 1,
  },
  {
    recipient: "Lily McCormack",
    email: "lmccormack@conneticventures.com",
    keywords: [
      "valuation",
      "portfolio compan",
      "ventures portfolio",
      "portfolio update",
    ],
    priority: 2,
  },
  {
    recipient: "Brad Zapp",
    email: "bzapp@conneticventures.com",
    keywords: [
      "fundraising",
      "cap table",
      "stock recommendation",
      "public stock",
      "hr",
    ],
    priority: 2,
  },
  {
    recipient: "Kyle Schlotman",
    email: "kschlotman@wendal.com",
    keywords: [
      "high net worth",
      "connetic fund 1",
      "connetic fund 2",
      "fund 1",
      "fund 2",
    ],
    priority: 2,
  },
  {
    recipient: "Brian McDermott",
    email: "bmcdermott@wendal.com",
    keywords: ["nav", "brokerage", "banking", "finance"],
    priority: 2,
  },
  {
    recipient: "JD Audena",
    email: "jaudena@conneticventures.com",
    keywords: [
      "compliance",
      "due diligence",
      "investor",
      "investor-facing",
      "marketing",
    ],
    priority: 3,
  },
  {
    // Fallback: any Wendal-related mail not claimed by a narrower rule above.
    recipient: "Hannah Creech",
    email: "scuba@wendal.com",
    keywords: ["wendal"],
    priority: 9,
  },
];

// VCAFX context split: fundraising/cap-table/stock context -> Brad;
// portfolio/valuation context -> Lily; ambiguous -> suggest both.
export const VCAFX = {
  brad: { recipient: "Brad Zapp", email: "bzapp@conneticventures.com" },
  lily: { recipient: "Lily McCormack", email: "lmccormack@conneticventures.com" },
  bradContext: ["fundraising", "cap table", "stock", "raise", "hr"],
  lilyContext: ["valuation", "portfolio", "ventures"],
};

export type ForwardSuggestion = { recipient: string; email: string };

// ---- Family senders -> your personal Gmail --------------------
// These match on the SENDER (address or display name), not keywords.
const PERSONAL_EMAIL = "chjelm88@gmail.com";

// Known addresses (most reliable match).
const FAMILY_ADDRESSES = [
  "molly.hjelm@gmail.com",
  "chris.hjelm@gmail.com",
  "kmhjelm@aol.com",
  "michelle.hjelm@gmail.com",
  "hjelm003@gmail.com",
  "teckardt3@gmail.com",
];

// Display-name fallback for senders whose address may vary or isn't known yet.
const FAMILY_NAMES = [
  "karen hjelm",
  "chris hjelm",
  "molly hjelm",
  "connor hjelm",
  "michelle hjelm",
  "tom eckardt",
];

export function matchFamilySender(
  fromAddress: string,
  fromName: string
): ForwardSuggestion | null {
  const addr = (fromAddress || "").toLowerCase().trim();
  const name = (fromName || "").toLowerCase().trim();
  const hit =
    FAMILY_ADDRESSES.includes(addr) ||
    FAMILY_NAMES.some((n) => name.includes(n));
  if (!hit) return null;
  return { recipient: "Personal (Gmail)", email: PERSONAL_EMAIL };
}

// Returns ordered, de-duplicated suggestions (most specific first).
export function matchForwardRules(
  subject: string,
  body: string
): ForwardSuggestion[] {
  const hay = `${subject} ${body}`.toLowerCase();
  const hits: { recipient: string; email: string; priority: number }[] = [];

  for (const rule of FORWARD_RULES) {
    if (rule.keywords.some((k) => hay.includes(k.toLowerCase()))) {
      hits.push({
        recipient: rule.recipient,
        email: rule.email,
        priority: rule.priority,
      });
    }
  }

  // VCAFX special handling
  if (hay.includes("vcafx")) {
    const matchBrad = VCAFX.bradContext.some((k) => hay.includes(k));
    const matchLily = VCAFX.lilyContext.some((k) => hay.includes(k));
    if (matchBrad && !matchLily) {
      hits.push({ ...VCAFX.brad, priority: 2 });
    } else if (matchLily && !matchBrad) {
      hits.push({ ...VCAFX.lily, priority: 2 });
    } else {
      // ambiguous -> suggest both
      hits.push({ ...VCAFX.brad, priority: 2 });
      hits.push({ ...VCAFX.lily, priority: 2 });
    }
  }

  hits.sort((a, b) => a.priority - b.priority);
  const seen = new Set<string>();
  const out: ForwardSuggestion[] = [];
  for (const hit of hits) {
    if (seen.has(hit.email)) continue;
    seen.add(hit.email);
    out.push({ recipient: hit.recipient, email: hit.email });
  }
  return out;
}
