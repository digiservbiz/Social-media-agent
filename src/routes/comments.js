const express = require('express');
const store = require('../db/store');
const { getAdapter } = require('../adapters');
const { generateCommentReply } = require('../ai');

const router = express.Router();

// GET /api/posts/:id/comments -> pulls comments for every platform this post went to
router.get('/:id/comments', async (req, res) => {
  const post = store.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const succeeded = (post.results || []).filter(r => r.success && r.remotePostId);
  const byPlatform = await Promise.all(succeeded.map(async (r) => {
    try {
      const account = store.getAccount(r.accountId);
      const adapter = getAdapter(r.platform);
      const refreshed = await adapter.refreshTokenIfNeeded(account);
      if (refreshed !== account) store.upsertAccount(refreshed);
      const comments = await adapter.listComments(refreshed, r.remotePostId);
      return { accountId: r.accountId, platform: r.platform, remotePostId: r.remotePostId, comments };
    } catch (err) {
      return { accountId: r.accountId, platform: r.platform, comments: [], error: err.message };
    }
  }));

  res.json({ postId: post.id, byPlatform });
});

// POST /api/posts/:id/comments/:accountId/:commentId/draft-reply
// Drafts an AI reply — does NOT post it. Human approves via the /reply endpoint below.
router.post('/:id/comments/:accountId/:commentId/draft-reply', async (req, res) => {
  const post = store.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const { commentText, tone } = req.body;
  if (!commentText) return res.status(400).json({ error: 'commentText is required' });

  try {
    const draft = await generateCommentReply(post.text, commentText, tone);
    res.json({ success: true, draft });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:id/comments/:accountId/:commentId/reply
// Actually posts the reply — call this only after a human has reviewed the text.
router.post('/:id/comments/:accountId/:commentId/reply', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const account = store.getAccount(req.params.accountId);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const adapter = getAdapter(account.platform);
    const refreshed = await adapter.refreshTokenIfNeeded(account);
    if (refreshed !== account) store.upsertAccount(refreshed);
    const result = await adapter.replyToComment(refreshed, req.params.commentId, text);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.response?.data ? JSON.stringify(err.response.data) : err.message });
  }
});

module.exports = router;
