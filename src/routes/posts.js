const express = require('express');
const axios = require('axios');
const { v4: uuid } = require('uuid');
const store = require('../db/store');
const { getAdapter } = require('../adapters');

const router = express.Router();

async function fireWebhook(event, payload) {
  if (!process.env.WEBHOOK_URL) return;
  try {
    await axios.post(process.env.WEBHOOK_URL, { event, ...payload });
  } catch (_) { /* webhook failures shouldn't break publishing */ }
}

function isRateLimitError(err) {
  return err.response?.status === 429;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Publishes to one account. Retries once on a 429 (rate limit) after a short wait —
// covers transient throttling without hammering the platform.
async function publishToAccount(post, accountId) {
  const account = store.getAccount(accountId);
  if (!account) return { accountId, success: false, error: 'Account not found' };

  const adapter = getAdapter(account.platform);
  const text = (post.platformText && post.platformText[account.platform]) || post.text;

  const attempt = async () => {
    const refreshed = await adapter.refreshTokenIfNeeded(account);
    if (refreshed !== account) store.upsertAccount(refreshed);
    return adapter.publish(refreshed, { text, mediaUrls: post.mediaUrls || [], link: post.link });
  };

  try {
    const result = await attempt();
    return { accountId, platform: account.platform, success: true, remotePostId: result.remotePostId };
  } catch (err) {
    if (isRateLimitError(err)) {
      await sleep(15000);
      try {
        const result = await attempt();
        return { accountId, platform: account.platform, success: true, remotePostId: result.remotePostId, retried: true };
      } catch (retryErr) {
        return {
          accountId, platform: account.platform, success: false,
          error: retryErr.response?.data ? JSON.stringify(retryErr.response.data) : retryErr.message,
          retried: true
        };
      }
    }
    return {
      accountId, platform: account.platform, success: false,
      error: err.response?.data ? JSON.stringify(err.response.data) : err.message
    };
  }
}

// POST /api/posts
// body: { text, platformText?, mediaUrls?, link?, accountIds: [...], scheduledFor?,
//         clientTag?, requiresApproval? }
router.post('/', async (req, res) => {
  const { text, platformText, mediaUrls, link, accountIds, scheduledFor, clientTag, requiresApproval } = req.body;

  if (!text || !accountIds?.length) {
    return res.status(400).json({ error: 'text and accountIds are required' });
  }

  const post = {
    id: uuid(),
    text,
    platformText: platformText || {},
    mediaUrls: mediaUrls || [],
    link: link || null,
    accountIds,
    clientTag: clientTag || null,
    scheduledFor: scheduledFor || null,
    status: requiresApproval ? 'pending_approval' : (scheduledFor ? 'scheduled' : 'publishing'),
    results: [],
    createdAt: new Date().toISOString()
  };
  store.createPost(post);

  if (requiresApproval || scheduledFor) {
    return res.json({ success: true, post });
  }

  const results = await Promise.all(accountIds.map(id => publishToAccount(post, id)));
  const updated = store.updatePost(post.id, {
    status: results.every(r => r.success) ? 'published' : 'partial_failure',
    results
  });
  await fireWebhook('post.published', { post: updated });
  res.json({ success: true, post: updated });
});

// GET /api/posts -> history (optional ?clientTag= filter)
router.get('/', (req, res) => {
  let posts = store.getPosts().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (req.query.clientTag) posts = posts.filter(p => p.clientTag === req.query.clientTag);
  res.json(posts);
});

// GET /api/posts/pending -> drafts awaiting approval
router.get('/pending', (req, res) => {
  res.json(store.getPendingApproval());
});

// POST /api/posts/:id/approve -> publishes (or schedules) a pending_approval post
router.post('/:id/approve', async (req, res) => {
  const post = store.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status !== 'pending_approval') return res.status(400).json({ error: `Post is '${post.status}', not pending approval` });

  if (post.scheduledFor) {
    const updated = store.updatePost(post.id, { status: 'scheduled' });
    return res.json({ success: true, post: updated });
  }

  const results = await Promise.all(post.accountIds.map(id => publishToAccount(post, id)));
  const updated = store.updatePost(post.id, {
    status: results.every(r => r.success) ? 'published' : 'partial_failure',
    results
  });
  await fireWebhook('post.published', { post: updated });
  res.json({ success: true, post: updated });
});

// POST /api/posts/:id/reject -> discards a pending draft
router.post('/:id/reject', (req, res) => {
  const post = store.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const updated = store.updatePost(post.id, { status: 'rejected' });
  res.json({ success: true, post: updated });
});

// GET /api/posts/:id/stats -> live views/likes/comments/shares per platform
router.get('/:id/stats', async (req, res) => {
  const post = store.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const succeeded = (post.results || []).filter(r => r.success && r.remotePostId);
  if (!succeeded.length) return res.json({ postId: post.id, stats: [] });

  const stats = await Promise.all(succeeded.map(async (r) => {
    try {
      const account = store.getAccount(r.accountId);
      const adapter = getAdapter(r.platform);
      const refreshed = await adapter.refreshTokenIfNeeded(account);
      if (refreshed !== account) store.upsertAccount(refreshed);
      const data = await adapter.getPostStats(refreshed, r.remotePostId);
      return { accountId: r.accountId, platform: r.platform, ...data, fetchedAt: new Date().toISOString() };
    } catch (err) {
      return {
        accountId: r.accountId, platform: r.platform,
        views: null, likes: null, comments: null, shares: null,
        error: err.response?.data ? JSON.stringify(err.response.data) : err.message
      };
    }
  }));

  store.updatePost(post.id, { lastStats: stats, lastStatsAt: new Date().toISOString() });
  res.json({ postId: post.id, stats });
});

module.exports = router;
module.exports.publishToAccount = publishToAccount;
module.exports.fireWebhook = fireWebhook;
