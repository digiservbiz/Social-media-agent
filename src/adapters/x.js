const axios = require('axios');
const crypto = require('crypto');
const BaseAdapter = require('./base');

const AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const API_BASE = 'https://api.twitter.com/2';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

class XAdapter extends BaseAdapter {
  constructor() {
    super('x');
    this.clientId = process.env.X_CLIENT_ID;
    this.clientSecret = process.env.X_CLIENT_SECRET;
    this.redirectUri = process.env.X_REDIRECT_URI;
  }

  getAuthUrl(state, session) {
    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    session.codeVerifier = verifier;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'tweet.read tweet.write users.read offline.access',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async handleCallback({ code, codeVerifier }) {
    const auth = this.clientSecret ? { username: this.clientId, password: this.clientSecret } : undefined;
    const tokenRes = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: this.redirectUri,
        client_id: this.clientId, code_verifier: codeVerifier
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, auth }
    );
    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const me = await axios.get(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${access_token}` } });
    return {
      platformUserId: me.data.data.id,
      displayName: me.data.data.username,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000
    };
  }

  async refreshTokenIfNeeded(account) {
    if (!account.expiresAt || account.expiresAt > Date.now() + 60000) return account;
    const auth = this.clientSecret ? { username: this.clientId, password: this.clientSecret } : undefined;
    const res = await axios.post(
      TOKEN_URL,
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: account.refreshToken, client_id: this.clientId }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, auth }
    );
    return {
      ...account,
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token || account.refreshToken,
      expiresAt: Date.now() + res.data.expires_in * 1000
    };
  }

  async publish(account, content) {
    const res = await axios.post(
      `${API_BASE}/tweets`,
      { text: content.text },
      { headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' } }
    );
    return { success: true, remotePostId: res.data.data.id };
  }

  async getPostStats(account, remotePostId) {
    const res = await axios.get(`${API_BASE}/tweets/${remotePostId}`, {
      params: { 'tweet.fields': 'public_metrics' },
      headers: { Authorization: `Bearer ${account.accessToken}` }
    });
    const m = res.data.data.public_metrics || {};
    return {
      views: m.impression_count ?? null,
      likes: m.like_count ?? null,
      comments: m.reply_count ?? null,
      shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0)
    };
  }

  async getFollowerCount(account) {
    const res = await axios.get(`${API_BASE}/users/${account.platformUserId}`, {
      params: { 'user.fields': 'public_metrics' },
      headers: { Authorization: `Bearer ${account.accessToken}` }
    });
    return res.data.data?.public_metrics?.followers_count ?? null;
  }

  async listComments(account, remotePostId) {
    // X calls replies "conversation" tweets; requires searching by conversation_id
    const res = await axios.get(`${API_BASE}/tweets/search/recent`, {
      params: { query: `conversation_id:${remotePostId}`, 'tweet.fields': 'author_id,created_at,text' },
      headers: { Authorization: `Bearer ${account.accessToken}` }
    });
    return (res.data.data || []).map(t => ({
      id: t.id, text: t.text, authorName: t.author_id, createdAt: t.created_at
    }));
  }

  async replyToComment(account, remotePostId, text) {
    const res = await axios.post(
      `${API_BASE}/tweets`,
      { text, reply: { in_reply_to_tweet_id: remotePostId } },
      { headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' } }
    );
    return { success: true, remoteCommentId: res.data.data.id };
  }
}

module.exports = XAdapter;
