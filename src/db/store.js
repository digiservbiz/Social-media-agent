// Minimal file-based JSON store. No native deps — runs anywhere Node runs.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data.json');

function load() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { accounts: [], posts: [], oauthState: {}, followerHistory: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  if (!data.followerHistory) data.followerHistory = [];
  return data;
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = {
  getAccounts() { return load().accounts; },
  getAccount(id) { return load().accounts.find(a => a.id === id); },
  getAccountsByPlatform(platform) { return load().accounts.filter(a => a.platform === platform); },
  upsertAccount(account) {
    const data = load();
    const idx = data.accounts.findIndex(a => a.id === account.id);
    if (idx >= 0) data.accounts[idx] = { ...data.accounts[idx], ...account };
    else data.accounts.push(account);
    save(data);
    return account;
  },
  deleteAccount(id) {
    const data = load();
    data.accounts = data.accounts.filter(a => a.id !== id);
    save(data);
  },

  getPosts() { return load().posts; },
  getPost(id) { return load().posts.find(p => p.id === id); },
  getDuePosts(nowIso) {
    return load().posts.filter(p => p.status === 'scheduled' && p.scheduledFor <= nowIso);
  },
  getPendingApproval() { return load().posts.filter(p => p.status === 'pending_approval'); },
  createPost(post) {
    const data = load();
    data.posts.push(post);
    save(data);
    return post;
  },
  updatePost(id, patch) {
    const data = load();
    const idx = data.posts.findIndex(p => p.id === id);
    if (idx < 0) return null;
    data.posts[idx] = { ...data.posts[idx], ...patch };
    save(data);
    return data.posts[idx];
  },
  deletePost(id) {
    const data = load();
    data.posts = data.posts.filter(p => p.id !== id);
    save(data);
  },

  // Follower count history — one row per account per snapshot
  addFollowerSnapshot(accountId, count) {
    const data = load();
    data.followerHistory.push({ accountId, count, at: new Date().toISOString() });
    save(data);
  },
  getFollowerHistory(accountId) {
    return load().followerHistory.filter(f => f.accountId === accountId).sort((a, b) => a.at < b.at ? -1 : 1);
  },

  setOAuthState(key, value) {
    const data = load();
    data.oauthState[key] = value;
    save(data);
  },
  popOAuthState(key) {
    const data = load();
    const value = data.oauthState[key];
    delete data.oauthState[key];
    save(data);
    return value;
  }
};
