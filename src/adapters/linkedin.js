const axios = require('axios');
const BaseAdapter = require('./base');

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const API_BASE = 'https://api.linkedin.com/v2';

class LinkedInAdapter extends BaseAdapter {
  constructor() {
    super('linkedin');
    this.clientId = process.env.LINKEDIN_CLIENT_ID;
    this.clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    this.redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  }

  getAuthUrl(state) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: 'openid profile w_member_social email'
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async handleCallback({ code }) {
    const tokenRes = await axios.post(TOKEN_URL, null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const { access_token, expires_in } = tokenRes.data;

    const profile = await axios.get(`${API_BASE}/userinfo`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    return {
      platformUserId: profile.data.sub,
      displayName: profile.data.name,
      accessToken: access_token,
      expiresAt: Date.now() + expires_in * 1000
    };
  }

  async publish(account, content) {
    const body = {
      author: `urn:li:person:${account.platformUserId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content.text },
          shareMediaCategory: content.link ? 'ARTICLE' : 'NONE',
          ...(content.link ? { media: [{ status: 'READY', originalUrl: content.link }] } : {})
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    };

    const res = await axios.post(`${API_BASE}/ugcPosts`, body, {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    const postId = res.headers['x-restli-id'] || res.data?.id;
    return { success: true, remotePostId: postId };
  }

  // LinkedIn's public metrics for a personal post are limited: likes + first-level
  // comment counts via socialActions. Impressions/views require org-page access
  // (r_organization_social), which most personal-profile tokens won't have.
  async getPostStats(account, remotePostId) {
    const urn = encodeURIComponent(remotePostId);
    const res = await axios.get(`${API_BASE}/socialActions/${urn}`, {
      headers: { Authorization: `Bearer ${account.accessToken}` }
    });
    return {
      views: null, // not available without organization scope
      likes: res.data.likesSummary?.totalLikes ?? null,
      comments: res.data.commentsSummary?.totalFirstLevelComments ?? null,
      shares: null
    };
  }
}

module.exports = LinkedInAdapter;
