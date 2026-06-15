// ============================================================
// connetic-hub email triage — ROUTING RULES
// This is the ONLY file you need to edit to tune behavior.
// ============================================================

// Master safety switch.
// While false, the engine ONLY ever creates DRAFTS — it never
// sends or forwards anything by itself. Flip to true only once
// you fully trust what it's drafting.
export const AUTO_SEND = false;

// People the engine knows about.
// Used for forwarding, and to help tell "a real person is waiting
// on a reply" apart from automated/marketing mail.
// >>> Replace the placeholder addresses with real ones. <<<
export const PEOPLE = {
  me: "chjelm88@gmail.com",
  molly: "REPLACE_WITH_MOLLY_EMAIL",
  dad: "REPLACE_WITH_DAD_EMAIL",
  // add more people here as needed, e.g. kid1: "...", kid2: "..."
};

// The buckets the AI sorts each email into. Add/remove freely.
export const CATEGORIES = [
  "home",
  "invoice",
  "receipt",
  "golf",
  "travel",
  "personal",
  "newsletter",
  "promotion",
  "spam",
  "other",
] as const;

// Draft a FORWARD of these categories to these people.
// Empty / missing = no forward. (Only forwards to real addresses —
// anything still set to REPLACE_WITH... is skipped automatically.)
export const FORWARD_RULES: Record<string, string[]> = {
  home: [PEOPLE.molly],
  invoice: [PEOPLE.molly],
  receipt: [PEOPLE.molly],
  golf: [PEOPLE.dad],
  travel: [PEOPLE.me, PEOPLE.molly, PEOPLE.dad], // everyone
};

// Categories that are just noise — archive them out of the inbox
// (they still get a label, they just leave the inbox view).
export const ARCHIVE_CATEGORIES = ["newsletter", "promotion", "spam"];

// Categories to treat as urgent — star + mark Important.
export const URGENT_CATEGORIES = ["home", "invoice"];

// How many of the newest inbox messages to scan per run.
export const SCAN_LIMIT = 25;
