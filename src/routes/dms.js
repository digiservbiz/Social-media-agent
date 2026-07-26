const express = require('express');
const store = require('../db/store');
const { getAdapter } = require('../adapters');
const { generateDMReply } = require('../ai');

const router = express.Router();

// GET /api/dms/:accountId/conversations
router.get('/:accountId/conversations', async (req, res) => {
  const account = store.getAccount(req.params.accountId);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  try {
    const adapter = getAdapter(account.platform);
    const refreshed = await adapter.refreshTokenIfNeeded(account);
    if (refreshed !== account) store.upsertAccount(refreshed);
    const conversations = await adapter.listConversations(refreshed);
    res.json({ accountId: account.id, conversations });
  } catch (err) {
    res.status(500).json({ error: err.response?.data ? JSON.stringify(err.response.data) : err.message });
  }
});

// GET /api/dms/:accountId/conversations/:conversationId/messages
router.get('/:accountId/conversations/:conversationId/messages', async (req, res) => {
  const account = store.getAccount(req.params.accountId);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  try {
    const adapter = getAdapter(account.platform);
    const refreshed = await adapter.refreshTokenIfNeeded(account);
    if (refreshed !== account) store.upsertAccount(refreshed);
    const messages = await adapter.getMessages(refreshed, req.params.conversationId);
    res.json({ conversationId: req.params.conversationId, messages });
  } catch (err) {
    res.status(500).json({ error: err.response?.data ? JSON.stringify(err.response.data) : err.message });
  }
});

// POST /api/dms/:accountId/conversations/:conversationId/draft-reply
// body: { history: [{ from: 'them'|'us', text }] }  — drafts only, doesn't send.
router.post('/:accountId/conversations/:conversationId/draft-reply', async (req, res) => {
  const { history, tone } = req.body;
  if (!history?.length) return res.status(400).json({ error: 'history[] is required' });
  try {
    const draft = await generateDMReply(history, tone);
    res.json({ success: true, draft });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dms/:accountId/conversations/:conversationId/reply
// Actually sends — call only after a human reviews the drafted text.
router.post('/:accountId/conversations/:conversationId/reply', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  const account = store.getAccount(req.params.accountId);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  try {
    const adapter = getAdapter(account.platform);
    const refreshed = await adapter.refreshTokenIfNeeded(account);
    if (refreshed !== account) store.upsertAccount(refreshed);
    const result = await adapter.sendMessage(refreshed, req.params.conversationId, text);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.response?.data ? JSON.stringify(err.response.data) : err.message });
  }
});

module.exports = router;
