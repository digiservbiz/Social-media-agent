const express = require('express');
const store = require('../db/store');
const { getAdapter } = require('../adapters');

const router = express.Router();

function engagementScore(stats) {
  if (!stats) return 0;
  return (stats.views || 0) * 0.1 + (stats.likes || 0) + (stats.comments || 0) * 2 + (stats.shares || 0) * 3;
}

// GET /api/analytics/summary?days=7
// Aggregates lastStats across posts: totals per platform, top posts, best posting hour.
router.get('/summary', (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const posts = store.getPosts().filter(p => new Date(p.createdAt).getTime() >= cutoff);

  const totalsByPlatform = {};
  const scored = [];

  for (const post of posts) {
    for (const s of post.lastStats || []) {
      if (!totalsByPlatform[s.platform]) {
        totalsByPlatform[s.platform] = { views: 0, likes: 0, comments: 0, shares: 0 };
      }
      totalsByPlatform[s.platform].views += s.views || 0;
      totalsByPlatform[s.platform].likes += s.likes || 0;
      totalsByPlatform[s.platform].comments += s.comments || 0;
      totalsByPlatform[s.platform].shares += s.shares || 0;
    }
    const postScore = (post.lastStats || []).reduce((sum, s) => sum + engagementScore(s), 0);
    scored.push({ id: post.id, text: post.text, createdAt: post.createdAt, score: postScore });
  }

  const topPosts = scored.sort((a, b) => b.score - a.score).slice(0, 3);

  // Best posting hour: average score of posts created in each hour-of-day bucket
  const hourBuckets = {};
  for (const p of scored) {
    const hour = new Date(p.createdAt).getUTCHours();
    if (!hourBuckets[hour]) hourBuckets[hour] = { total: 0, count: 0 };
    hourBuckets[hour].total += p.score;
    hourBuckets[hour].count += 1;
  }
  const hourAverages = Object.entries(hourBuckets)
    .map(([hour, v]) => ({ hourUTC: parseInt(hour), avgScore: v.total / v.count, sampleSize: v.count }))
    .sort((a, b) => b.avgScore - a.avgScore);

  res.json({
    windowDays: days,
    totalsByPlatform,
    topPosts,
    bestPostingHours: hourAverages.slice(0, 3),
    note: hourAverages.length < 5 ? 'Not enough post history yet for a reliable best-time recommendation — needs more data.' : undefined
  });
});

// POST /api/analytics/followers/refresh -> pulls current follower count for every
// connected account and stores a snapshot. Call this on a schedule (e.g. daily via
// your own cron/n8n) or manually from the dashboard.
router.post('/followers/refresh', async (req, res) => {
  const accounts = store.getAccounts();
  const results = await Promise.all(accounts.map(async (account) => {
    try {
      const adapter = getAdapter(account.platform);
      const refreshed = await adapter.refreshTokenIfNeeded(account);
      if (refreshed !== account) store.upsertAccount(refreshed);
      const count = await adapter.getFollowerCount(refreshed);
      if (count !== null) store.addFollowerSnapshot(account.id, count);
      return { accountId: account.id, platform: account.platform, followerCount: count };
    } catch (err) {
      return { accountId: account.id, platform: account.platform, followerCount: null, error: err.message };
    }
  }));
  res.json({ success: true, results });
});

// GET /api/analytics/followers/:accountId -> history for one account
router.get('/followers/:accountId', (req, res) => {
  res.json(store.getFollowerHistory(req.params.accountId));
});

module.exports = router;
