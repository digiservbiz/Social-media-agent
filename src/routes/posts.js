const express = require('express');
const { v4: uuid } = require('uuid');
const store = require('../db/store');
const { getAdapter } = require('../adapters');

const router = express.Router();

// Publishes to one account and records the result on the post record.
async function publishToAccount(post, accountId) {
  const account = store.getAccount(accountId);
  if (!account) return { accountId, success: false, error: 'Account not found' };

  const adapter = getAdapter(account.platform);
  try {
    const refreshed = await adapter.refreshTokenIfNeeded(account);
    if (refreshed !== account) store.upsertAccount(refreshed);

    const result = await adapter.publish(refreshed, {
      text: post.text,
      mediaUrls: post.mediaUrls || [],
      link: post.link
    });
    return { accountId, platform: account.platform, success: true, remotePostId: result.remotePostId };
  } catch (err) {
    return {
      accountId,
      platform: account.platform,
      success: false,
      error: err.response?.data ? JSON.stringify(err.response.data) : err.message
    };
  }
}

// POST /api/posts
// body: { text, mediaUrls?, link?, accountIds: [...], scheduledFor? (ISO string, omit to post now) }
router.post('/', async (req, res) => {
  const { text, mediaUrls, link, accountIds, scheduledFor } = req.body;

  if (!text || !accountIds?.length) {
    return res.status(400).json({ error: 'text and accountIds are required' });
  }

  const post = {
    id: uuid(),
    text,
    mediaUrls: mediaUrls || [],
    link: link || null,
    accountIds,
    scheduledFor: scheduledFor || null,
    status: scheduledFor ? 'scheduled' : 'publishing',
    results: [],
    createdAt: new Date().toISOString()
  };
  store.createPost(post);

  if (scheduledFor) {
    return res.json({ success: true, post });
  }

  // Publish immediately, to all requested accounts in parallel
  const results = await Promise.all(accountIds.map(id => publishToAccount(post, id)));
  const updated = store.updatePost(post.id, {
    status: results.every(r => r.success) ? 'published' : 'partial_failure',
    results
  });
  res.json({ success: true, post: updated });
});

// GET /api/posts -> history
router.get('/', (req, res) => {
  res.json(store.getPosts().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
});

// GET /api/posts/:id/stats -> live views/likes/comments/shares per platform for this post.
// Fetches fresh from each platform on every call (not cached) and stores the last-known
// snapshot on the post record so history keeps a value even if a later fetch fails.
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
        accountId: r.accountId,
        platform: r.platform,
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
