const express = require('express');
const store = require('../db/store');

const router = express.Router();

router.get('/', (req, res) => {
  const accounts = store.getAccounts().map(({ accessToken, refreshToken, ...safe }) => safe);
  res.json(accounts);
});

// PATCH /api/accounts/:id
// body: { clientTag?, autoReplyEnabled?, autoReplyMessage?, keywordDmRules? }
// keywordDmRules: [{ keyword: "AI", message: "Thanks for asking about AI! Here's..." }]
// When someone comments a keyword on a post, they get a private-reply DM tied to
// that comment — Meta's sanctioned comment-to-DM mechanism.
router.patch('/:id', (req, res) => {
  const account = store.getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const { clientTag, autoReplyEnabled, autoReplyMessage, keywordDmRules } = req.body;
  const updated = store.upsertAccount({
    ...account,
    clientTag: clientTag ?? account.clientTag ?? null,
    autoReplyEnabled: autoReplyEnabled ?? account.autoReplyEnabled ?? false,
    autoReplyMessage: autoReplyMessage ?? account.autoReplyMessage ?? "Thanks for reaching out! We've received your message and will get back to you soon.",
    keywordDmRules: keywordDmRules ?? account.keywordDmRules ?? []
  });
  const { accessToken, refreshToken, ...safe } = updated;
  res.json(safe);
});

router.delete('/:id', (req, res) => {
  store.deleteAccount(req.params.id);
  res.json({ success: true });
});

module.exports = router;
