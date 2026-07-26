const express = require('express');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const store = require('../db/store');
const { getAdapter } = require('../adapters');

const router = express.Router();

// GET /auth/:platform/connect  -> redirects user to the platform's OAuth screen
router.get('/:platform/connect', (req, res) => {
  try {
    const adapter = getAdapter(req.params.platform);
    const state = crypto.randomBytes(16).toString('hex');
    const session = {};
    const url = adapter.getAuthUrl(state, session);
    store.setOAuthState(state, { platform: req.params.platform, ...session });
    res.redirect(url);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /auth/:platform/callback -> exchanges code for tokens, saves account
router.get('/:platform/callback', async (req, res) => {
  const { code, state } = req.query;
  try {
    const saved = store.popOAuthState(state);
    if (!saved || saved.platform !== req.params.platform) {
      return res.status(400).send('Invalid or expired OAuth state. Try connecting again.');
    }

    const adapter = getAdapter(req.params.platform);
    const result = await adapter.handleCallback({ code, codeVerifier: saved.codeVerifier });

    const account = {
      id: uuid(),
      platform: req.params.platform,
      platformUserId: result.platformUserId,
      displayName: result.displayName,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken || null,
      expiresAt: result.expiresAt || null,
      meta: result.meta || {},
      connectedAt: new Date().toISOString()
    };
    store.upsertAccount(account);

    res.send(`
      <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h2>✅ Connected: ${account.displayName} (${account.platform})</h2>
        <p>You can close this tab and go back to the dashboard.</p>
        <a href="/">Return to dashboard</a>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send(`<pre>Connection failed: ${err.response?.data ? JSON.stringify(err.response.data, null, 2) : err.message}</pre>`);
  }
});

module.exports = router;
