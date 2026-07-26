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

      // Inbound messages -> first-message auto-acknowledge
      const messagingEvents = entry.messaging || [];
      for (const event of messagingEvents) {
        if (!event.message || event.message.is_echo) continue;
        const senderId = event.sender?.id;
        if (!senderId) continue;

        const account = store.getAccounts().find(a =>
          a.platformUserId === pageId || a.meta?.igAccountId === pageId
        );
        if (!account || !account.autoReplyEnabled) continue;
        if (store.hasAutoReplied(account.id, senderId)) continue;

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

      // New comments -> keyword-triggered private reply DM
      const changes = entry.changes || [];
      for (const change of changes) {
        const isFbComment = change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add';
        const isIgComment = change.field === 'comments';
        if (!isFbComment && !isIgComment) continue;

        const commentId = change.value?.comment_id || change.value?.id;
        const commentText = change.value?.message || change.value?.text || '';
        if (!commentId || !commentText) continue;

        const account = store.getAccounts().find(a =>
          a.platformUserId === pageId || a.meta?.igAccountId === pageId
        );
        if (!account || !account.keywordDmRules?.length) continue;
        if (store.hasHandledCommentDm(commentId)) continue;

        const lowerText = commentText.toLowerCase();
        const rule = account.keywordDmRules.find(r => r.keyword && lowerText.includes(r.keyword.toLowerCase()));
        if (!rule) continue;

        try {
          const adapter = getAdapter(account.platform);
          await adapter.sendPrivateReply(account, commentId, rule.message);
          store.markCommentDmHandled(commentId);
          console.log(`[webhook] Keyword "${rule.keyword}" matched on comment ${commentId} — private reply sent on ${account.platform}`);
        } catch (err) {
          console.error('[webhook] Keyword-DM private reply failed:', err.response?.data || err.message);
        }
      }
    }
  } catch (err) {
    console.error('[webhook] Error processing Meta webhook:', err.message);
  }
});

module.exports = router;
