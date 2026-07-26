const cron = require('node-cron');
const store = require('./db/store');
const { publishToAccount } = require('./routes/posts');

// Runs every minute, checks for scheduled posts whose time has come, publishes them.
function startScheduler() {
  cron.schedule('* * * * *', async () => {
    const now = new Date().toISOString();
    const due = store.getDuePosts(now);

    for (const post of due) {
      const results = await Promise.all(post.accountIds.map(id => publishToAccount(post, id)));
      store.updatePost(post.id, {
        status: results.every(r => r.success) ? 'published' : 'partial_failure',
        results
      });
      console.log(`[scheduler] Published post ${post.id}: ${results.map(r => `${r.platform}=${r.success}`).join(', ')}`);
    }
  });
  console.log('[scheduler] Running — checking for due posts every minute.');
}

module.exports = { startScheduler };
