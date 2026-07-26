# Social Poster

Self-hosted app that posts to LinkedIn, Facebook, Instagram, X, and TikTok from one
dashboard or one API call, and pulls back engagement stats (views, likes, comments,
shares) per post. Standalone — no dependency on any other workflow.

## Setup

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

Set each `*_REDIRECT_URI` to match what you register in the platform's app settings:
`http://localhost:3300/auth/<platform>/callback` locally, or
`https://yourdomain.com/auth/<platform>/callback` once deployed.

## Run

```bash
npm start        # production
npm run dev       # auto-restart on file changes
```

Open `http://localhost:3300`. Click a platform pill to connect it, write a post, pick
which connected accounts to send it to, optionally set a schedule time, hit Post.
Every published post in the History section gets a "Refresh stats" button that pulls
live views/likes/comments/shares from that platform.

## API

Everything the dashboard does is also a plain HTTP endpoint, so you can drive it from
anywhere (curl, a script, n8n, etc.) without touching the UI:

```
GET  /api/accounts              -> list connected accounts (id, platform, name)
DELETE /api/accounts/:id        -> disconnect an account

POST /api/posts
Content-Type: application/json
{
  "text": "Your post text",
  "accountIds": ["<id from GET /api/accounts>"],
  "mediaUrls": ["https://..."],   // required for Instagram/TikTok
  "link": "https://...",          // optional, Facebook/LinkedIn
  "scheduledFor": "2026-08-01T09:00:00Z"  // omit to post immediately
}

GET  /api/posts                 -> full post history + per-platform results

GET  /api/posts/:id/stats       -> fetches live views/likes/comments/shares for a
                                    post from each platform it was published to.
                                    Result is also cached on the post record as
                                    `lastStats` so history keeps a value even if
                                    a later fetch fails.
```

### What stats are actually available per platform

| Platform  | Views | Likes | Comments | Shares | Notes |
|-----------|:-----:|:-----:|:--------:|:------:|-------|
| X         | ✅ | ✅ | ✅ | ✅ (retweets+quotes) | Full public metrics |
| Instagram | ✅ (plays/reach) | ✅ | ✅ | — | Needs `instagram_manage_insights` |
| Facebook  | ✅ (impressions) | ✅ | ✅ | ✅ | Needs `read_insights` |
| LinkedIn  | ❌ | ✅ | ✅ | — | View counts only exist for Company Page posts, not personal profile posts |
| TikTok    | ✅ | ✅ | ✅ | ✅ | Only works once your app clears TikTok's review |

If you want to trigger posts from n8n, point an HTTP Request node at
`POST http://<this-app-host>:3300/api/posts` with the body above — that's the entire
integration, no further coupling.

## Architecture

- `src/adapters/*` — one file per platform, all implementing the same interface
  (`getAuthUrl`, `handleCallback`, `publish`, `refreshTokenIfNeeded`). Adding a new
  platform = one new adapter file registered in `adapters/index.js`.
- `src/db/store.js` — flat JSON file storage (`data.json`). Zero setup. Swap for
  Postgres later if you outgrow it.
- `src/scheduler.js` — cron job checking every minute for due scheduled posts.
- `public/index.html` — single-file dashboard, no build step, no framework.

## Deploying to a VPS

```bash
git clone <your repo> social-poster && cd social-poster
npm install --production
cp .env.example .env   # fill in real values + real domain redirect URIs
```

Run with pm2 (or systemd, or Docker — whatever you're already using):

```bash
npm install -g pm2
pm2 start src/server.js --name social-poster
pm2 save
```

Put it behind a reverse proxy (nginx/Caddy) on its own subdomain with HTTPS — OAuth
redirect URIs must be HTTPS in production for every platform except local testing.

## Known limits

- **X free tier**: ~500 posts/month.
- **TikTok**: public posting (and its stats) requires app review; sandbox-only until approved.
- **Instagram**: `publish()` needs a public media URL — you can't upload a raw file
  directly, so host the image/video somewhere first (any public URL works).
- **Facebook Page tokens**: effectively long-lived but tied to the user token that
  created them — if app access is revoked on Facebook's side, reconnect.
- **LinkedIn**: no view/impression counts for personal profile posts — that data only
  exists for Company Page posts via a separate, more restricted API scope.
