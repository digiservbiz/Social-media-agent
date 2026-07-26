const axios = require('axios');
const crypto = require('crypto');
const BaseAdapter = require('./base');

const AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const API_BASE = 'https://api.twitter.com/2';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// X's free tier (as of writing) allows ~500 posts/month via the v2 API.
// PKCE is required for OAuth2 user-context auth — no client secret needed
// for the public/native app flow, but we support confidential clients too.
class XAdapter extends BaseAdapter {
  constructor() {
    super('x');
    this.clientId = process.env.X_CLIENT_ID;
    this.clientSecret = process.env.X_CLIENT_SECRET; // optional, confidential client
    this.redirectUri = process.env.X_REDIRECT_URI;
  }

  getAuthUrl(state, session) {
    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    session.codeVerifier = verifier; // caller persists this against `state`

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
    const auth = this.clientSecret
      ? { username: this.clientId, password: this.clientSecret }
      : undefined;

    const tokenRes = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        code_verifier: codeVerifier
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, auth }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    const me = await axios.get(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

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
    const auth = this.clientSecret
      ? { username: this.clientId, password: this.clientSecret }
      : undefined;

    const res = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
        client_id: this.clientId
      }),
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
}

module.exports = XAdapter;
