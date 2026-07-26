const express = require('express');
const store = require('../db/store');
const { getAdapter } = require('../adapters');

const router = express.Router();

// Meta (Facebook + Instagram) webhook — handles the verification handshake and
// incoming message events for the opt-in "first message" auto-acknowledge.
// Register this URL (https://yourdomain/webhooks/meta) in your Meta App's
// Messenger/Instagram webhook settings, subscribed to the "messages" field.

router.get('/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post('/meta', express.json(), async (req, res) => {
  res.sendStatus(200); // ack immediately — Meta expects a fast response

  try {
    const entries = req.body.entry || [];
    for (const entry of entries) {
      const pageId = entry.id;
      const events = entry.messaging || [];
      for (const event of events) {
        if (!event.message || event.message.is_echo) continue; // ignore our own sent messages

        const senderId = event.sender?.id;
        if (!senderId) continue;

        // Find the connected account this page/IG id belongs to
        const account = store.getAccounts().find(a =>
          a.platformUserId === pageId || a.meta?.igAccountId === pageId
        );
        if (!account || !account.autoReplyEnabled) continue;
        if (store.hasAutoReplied(account.id, senderId)) continue;

        const adapter = getAdapter(account.platform);
        // sendMessage expects a conversation id in our other endpoints, but the
        // Send API also accepts a direct recipient id — reuse the same PSID here.
        try {
          const axios = require('axios');
          await axios.post('https://graph.facebook.com/v21.0/me/messages', {
            recipient: { id: senderId },
            message: { text: account.autoReplyMessage }
          }, { params: { access_token: account.accessToken } });
          store.markAutoReplied(account.id, senderId);
          console.log(`[webhook] Auto-acknowledged first message from ${senderId} on ${account.platform}`);
        } catch (err) {
          console.error('[webhook] Auto-reply send failed:', err.response?.data || err.message);
        }
      }
    }
  } catch (err) {
    console.error('[webhook] Error processing Meta webhook:', err.message);
  }
});

module.exports = router;
