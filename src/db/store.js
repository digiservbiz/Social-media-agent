// Minimal file-based JSON store. No native deps — runs anywhere Node runs.
// Swap this out for Postgres later if you outgrow it; the interface is tiny.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data.json');

function load() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { accounts: [], posts: [], oauthState: {} };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = {
  // Connected social accounts (tokens live here)
  getAccounts() {
    return load().accounts;
  },
  getAccount(id) {
    return load().accounts.find(a => a.id === id);
  },
  getAccountsByPlatform(platform) {
    return load().accounts.filter(a => a.platform === platform);
  },
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

  // Posts (immediate + scheduled)
  getPosts() {
    return load().posts;
  },
  getPost(id) {
    return load().posts.find(p => p.id === id);
  },
  getDuePosts(nowIso) {
    return load().posts.filter(p => p.status === 'scheduled' && p.scheduledFor <= nowIso);
  },
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

  // Transient OAuth state (CSRF protection during auth redirects)
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
