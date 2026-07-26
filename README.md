# Social Poster

Self-hosted app that posts to LinkedIn, Facebook, Instagram, X, and TikTok, pulls back
engagement stats, drafts AI captions and comment replies, tracks followers, and
supports an approval queue for multi-client use. Standalone — no dependency on any
other workflow.

## Quick install (one command)

```bash
git clone https://github.com/digiservbiz/Social-media-agent.git
cd Social-media-agent
./scripts/install.sh
```

This detects your existing Docker networks (so it can join the same one your n8n
stack uses), asks for the subdomain you want to run on, sets up `.env` with the
right redirect URIs pre-filled, opens it in `nano` so you can paste in your API
credentials, then builds and starts the container. It never touches your existing
n8n `docker-compose.yml` — it generates its own `docker-compose.generated.yml`
alongside it.

If you skip picking a network (just press Enter), it runs standalone on port 3300
and you'll need to handle your own reverse proxy/SSL.

## Manual setup

If you'd rather do it by hand or aren't using Docker:

```bash
npm install
cp .env.example .env
```

For each platform you want, create a free developer app and put the credentials in `.env`:

| Platform  | Where to create the app                        | Notes |
|-----------|--------------------------------------------------|-------|
| LinkedIn  | linkedin.com/developers/apps                     | Request "Share on LinkedIn" product |
| Facebook/Instagram | developers.facebook.com/apps            | Needs a Facebook Page; Instagram must be a Business account linked to that Page |
| X         | developer.twitter.com/en/portal/dashboard         | Free tier: ~500 posts/month |
| TikTok    | developers.tiktok.com/apps                        | Public posting needs app review (free, takes a few days). Sandbox works immediately for testing |

Set each `*_REDIRECT_URI` to match what you register in the platform's app settings.

For AI captions and comment-reply drafting, add an OpenRouter key:
```
OPENROUTER_API_KEY=...   # https://openrouter.ai/keys
OPENROUTER_MODEL=anthropic/claude-3.5-haiku   # or any OpenRouter model
```

Optional: set `WEBHOOK_URL` to have the app POST `{ event: "post.published", post }` to
your own endpoint (e.g. an n8n webhook) after every publish attempt.

## Run

```bash
npm start        # production
npm run dev       # auto-restart on file changes
```

Open `http://localhost:3300`.

## Features

**Posting** — write once, optionally override text per platform, attach one or more
media URLs (multiple = carousel on Instagram/Facebook), post now or schedule for later.

**Approval queue** — check "Require approval" on a post and it lands in the Pending
list instead of going live. Approve or reject from the dashboard. Useful when you're
posting on behalf of clients and someone else needs to sign off first.

**Multi-client tagging** — tag each connected account and each post with a client name,
then filter the History view by tag.

**AI caption drafting** — give a topic, get a caption drafted per selected platform
(different length/tone rules baked in per platform), editable before you post.

**Analytics** — a summary tab aggregates views/likes/comments/shares by platform over
the last N days, ranks your top posts by an engagement score, and surfaces which
hour-of-day your best posts tend to go out at (needs enough post history to be useful).

**Follower tracking** — one button pulls current follower counts across all connected
accounts and stores a snapshot so you can see growth over time.

**Comment handling** — view comments on any published post, get an AI-drafted reply,
edit it, then send. Nothing posts automatically — every reply needs a human click.
TikTok comment access isn't available on the standard posting API tier, so that one's
a stub until TikTok grants broader access.

**Direct messages** — view inbound DM conversations (Facebook, Instagram, X), get an
AI-drafted reply, edit it, then send. Same human-approval model as comments. There's
also an opt-in **first-message auto-acknowledge**: when a new contact messages you for
the first time, it can auto-send a canned "thanks, we'll get back to you" — a standard,
non-manipulative pattern (like an out-of-office reply), sent once per contact, never
repeated. This requires setting up a Meta webhook (see below); X and LinkedIn don't
have the API access needed for a real-time equivalent.

**Comment-to-DM keywords** — set up rules like "if someone comments the word AI on a
post, send them a DM with this message." This uses Meta's **Private Reply** API — the
sanctioned mechanism for this exact pattern (the same one behind tools like ManyChat's
"comment to DM"). It's tied to a specific comment, fires once, and only reaches people
who chose to comment that word — not a cold/unsolicited DM. Configure it per account in
the Direct Messages panel; each rule is a keyword + the message to send.

### Setting up the Meta webhook (for DM auto-acknowledge + keyword DMs)

1. Set `META_WEBHOOK_VERIFY_TOKEN` in `.env` to any random string.
2. In your Meta App dashboard → Webhooks → add a subscription:
   - Callback URL: `https://yourdomain.com/webhooks/meta`
   - Verify token: the same string you put in `.env`
   - Subscribe to: `messages` (for DM auto-acknowledge), `feed` (Facebook comments),
     `comments` (Instagram comments)
3. In the dashboard's Direct Messages panel: toggle "Auto-acknowledge" and/or add
   keyword rules for the account you want.

**Retry logic** — a failed publish due to rate-limiting (HTTP 429) is retried once
automatically after a short delay.

## What's deliberately NOT in here

Automated DMs soliciting likes, follows, or reactions to "grow" an account. Every
platform's terms of service treats that as inauthentic engagement / spam, and it's a
fast way to get pages suspended rather than grown. If you want DM automation for
something legitimate — e.g. auto-responding to inbound customer DMs — that's a
different, addable feature; just not this one.

## API

```
GET  /api/accounts                          -> list connected accounts
PATCH /api/accounts/:id                     -> set clientTag: { "clientTag": "..." }
DELETE /api/accounts/:id                    -> disconnect an account

POST /api/posts
{
  "text": "fallback text",
  "platformText": { "x": "shorter version", "linkedin": "longer version" },
  "accountIds": ["..."],
  "mediaUrls": ["https://..."],
  "link": "https://...",
  "scheduledFor": "2026-08-01T09:00:00Z",
  "clientTag": "acme-corp",
  "requiresApproval": true
}

GET  /api/posts?clientTag=acme-corp         -> history, optional tag filter
GET  /api/posts/pending                     -> drafts awaiting approval
POST /api/posts/:id/approve                 -> publish/schedule a pending draft
POST /api/posts/:id/reject                  -> discard a pending draft
GET  /api/posts/:id/stats                   -> live views/likes/comments/shares

GET  /api/posts/:id/comments                -> comments per platform for this post
POST /api/posts/:id/comments/:accountId/:commentId/draft-reply   { commentText }
POST /api/posts/:id/comments/:accountId/:commentId/reply         { text }

POST /api/captions/generate                 { topic, platforms: [...] }

GET  /api/dms/:accountId/conversations                              -> list DM conversations
GET  /api/dms/:accountId/conversations/:id/messages                 -> messages in one conversation
POST /api/dms/:accountId/conversations/:id/draft-reply   { history }  -> AI-drafted reply, not sent
POST /api/dms/:accountId/conversations/:id/reply         { text }     -> actually sends

GET  /api/analytics/summary?days=7          -> totals, top posts, best posting hours
POST /api/analytics/followers/refresh       -> snapshot current follower counts
GET  /api/analytics/followers/:accountId    -> follower history for one account
```

If you want to trigger posts from n8n, point an HTTP Request node at `POST /api/posts`
with the body above, or subscribe to `WEBHOOK_URL` to get notified when posts go out.

## Architecture

- `src/adapters/*` — one file per platform, all implementing the same interface
  (`getAuthUrl`, `handleCallback`, `publish`, `refreshTokenIfNeeded`, `getPostStats`,
  `getFollowerCount`, `listComments`, `replyToComment`). Adding a new platform = one
  new adapter file registered in `adapters/index.js`.
- `src/ai.js` — OpenRouter wrapper for caption + reply drafting. Nothing in here posts
  anything; it only returns text for a human to review.
- `src/db/store.js` — flat JSON file storage (`data.json`). Zero setup. Swap for
  Postgres later if you outgrow it.
- `src/scheduler.js` — cron job checking every minute for due scheduled posts.
- `public/index.html` — single-file dashboard, no build step, no framework.

## Deploying to a VPS

```bash
git clone <your repo> social-poster && cd social-poster
npm install --production
cp .env.example .env   # fill in real values + real domain redirect URIs
npm install -g pm2
pm2 start src/server.js --name social-poster
pm2 save
```

Put it behind a reverse proxy (nginx/Caddy) on its own subdomain with HTTPS — OAuth
redirect URIs must be HTTPS in production for every platform except local testing.

## Known limits

- **X free tier**: ~500 posts/month.
- **TikTok**: public posting requires app review; sandbox-only until approved. Comment
  access requires additional API tier beyond standard posting.
- **Instagram**: `publish()` needs a public media URL — host the image/video somewhere
  first (any public URL works).
- **Facebook Page tokens**: effectively long-lived but tied to the user token that
  created them — if app access is revoked on Facebook's side, reconnect.
- **LinkedIn**: no view/impression counts or follower counts for personal profile
  posts — that data only exists for Company Page posts via a separate, more
  restricted API scope. No public DM API for third-party apps either.
- **X DMs**: the Direct Message endpoints require a paid API tier above free — will
  403 until you're on Basic/Pro. Manual draft/send still works once you have access.
