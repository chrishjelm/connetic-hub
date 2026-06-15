# connetic-hub — Email Triage Setup

The triage engine scans your Gmail inbox on a schedule, classifies each new
message with Claude, then labels it, archives noise, flags anything urgent,
and drafts replies/forwards. While `AUTO_SEND = false`, it ONLY drafts —
nothing is ever sent or forwarded automatically.

## Files (where each one goes in the repo)

| File | Path in repo |
|------|--------------|
| Engine | `app/api/triage/route.ts` |
| Your rules | `lib/routing.ts` |
| Schedule | `vercel.json` (repo root) |
| This doc | `SETUP-triage.md` (repo root) |

## Environment variables (set in Vercel → Production)

| Key | Value |
|-----|-------|
| `GMAIL_CLIENT_ID` | Your Google OAuth client ID (`653839690395-...`) |
| `GMAIL_CLIENT_SECRET` | Your Google OAuth client secret (`GOCSPX-...`) |
| `GMAIL_REFRESH_TOKEN` | The `1//...` token from OAuth Playground |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (`sk-ant-...`) |

After adding them, redeploy so the new code + vars take effect.

## First test

Visit `https://connetic-hub.vercel.app/api/triage` in a browser.
It returns JSON listing every message it scanned and what it did.
Then open Gmail — you'll see new `Triage/*` labels and draft replies/forwards,
with nothing sent.

## Tuning

Edit `lib/routing.ts` only:
- `PEOPLE` — real email addresses (replace the REPLACE_WITH placeholders)
- `FORWARD_RULES` — who gets a forward of which category
- `ARCHIVE_CATEGORIES` / `URGENT_CATEGORIES`
- `SCAN_LIMIT` — how many messages per run
- `AUTO_SEND` — leave false until you trust the drafts

## Schedule

`vercel.json` runs it hourly (`0 * * * *`). For every 15 minutes use
`*/15 * * * *`.

## Notes
- The Google OAuth app is in "Testing" mode, so the refresh token expires in
  ~7 days. To make it durable: Google Cloud → OAuth consent screen / Audience
  → Publish App, then regenerate the refresh token once.
