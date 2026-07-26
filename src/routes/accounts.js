const express = require('express');
const store = require('../db/store');

const router = express.Router();

// GET /api/accounts -> list connected accounts (no tokens leaked to the client)
router.get('/', (req, res) => {
  const accounts = store.getAccounts().map(({ accessToken, refreshToken, ...safe }) => safe);
  res.json(accounts);
});

// DELETE /api/accounts/:id -> disconnect an account
router.delete('/:id', (req, res) => {
  store.deleteAccount(req.params.id);
  res.json({ success: true });
});

module.exports = router;
