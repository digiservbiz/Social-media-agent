const express = require('express');
const store = require('../db/store');

const router = express.Router();

// GET /api/accounts -> list connected accounts (no tokens leaked to the client)
router.get('/', (req, res) => {
  const accounts = store.getAccounts().map(({ accessToken, refreshToken, ...safe }) => safe);
  res.json(accounts);
});

// PATCH /api/accounts/:id -> set a client tag / display label for multi-client use
router.patch('/:id', (req, res) => {
  const account = store.getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const { clientTag } = req.body;
  const updated = store.upsertAccount({ ...account, clientTag: clientTag ?? account.clientTag ?? null });
  const { accessToken, refreshToken, ...safe } = updated;
  res.json(safe);
});

// DELETE /api/accounts/:id -> disconnect an account
router.delete('/:id', (req, res) => {
  store.deleteAccount(req.params.id);
  res.json({ success: true });
});

module.exports = router;
