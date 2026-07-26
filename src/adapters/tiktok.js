const axios = require('axios');
const BaseAdapter = require('./base');

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const API_BASE = 'https://open.tiktokapis.com/v2';

class TikTokAdapter extends BaseAdapter {
  constructor() {
    super('tiktok');
    this.clientKey = process.env.TIKTOK_CLIENT_KEY;
    this.clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    this.redirectUri = process.env.TIKTOK_REDIRECT_URI;
  }

  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_key: this.clientKey, redirect_uri: this.redirectUri, response_type: 'code',
      scope: 'user.info.basic,video.publish,video.list', state
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async handleCallback({ code }) {
    const tokenRes = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        client_key: this.clientKey, client_secret: this.clientSecret, code,
        grant_type: 'authorization_code', redirect_uri: this.redirectUri
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token, refresh_token, expires_in, open_id } = tokenRes.data;
    return {
      platformUserId: open_id, displayName: open_id, accessToken: access_token,
      refreshToken: refresh_token, expiresAt: Date.now() + expires_in * 1000
    };
  }

  async publish(account, content) {
    if (!content.mediaUrls?.length) throw new Error('TikTok requires a video URL — text-only posts are not supported.');
    const res = await axios.post(
      `${API_BASE}/post/publish/video/init/`,
      { post_info: { title: content.text }, source_info: { source: 'PULL_FROM_URL', video_url: content.mediaUrls[0] } },
      { headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' } }
    );
    return { success: true, remotePostId: res.data.data?.publish_id };
  }

  async getPostStats(account, remoteVideoId) {
    const res = await axios.post(
      `${API_BASE}/video/query/`,
      { filters: { video_ids: [remoteVideoId] } },
      { params: { fields: 'view_count,like_count,comment_count,share_count' },
        headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' } }
    );
    const v = res.data.data?.videos?.[0] || {};
    return { views: v.view_count ?? null, likes: v.like_count ?? null, comments: v.comment_count ?? null, shares: v.share_count ?? null };
  }

  async getFollowerCount(account) {
    const res = await axios.get(`${API_BASE}/user/info/`, {
      params: { fields: 'follower_count' },
      headers: { Authorization: `Bearer ${account.accessToken}` }
    });
    return res.data.data?.user?.follower_count ?? null;
  }

  // TikTok comment listing/replying requires the Research/Display API tier,
  // not the standard Content Posting API — stubbed until that access is approved.
  async listComments() {
    throw new Error('TikTok comment access requires additional API approval beyond standard posting access.');
  }
  async replyToComment() {
    throw new Error('TikTok comment replies require additional API approval beyond standard posting access.');
  }
}

module.exports = TikTokAdapter;
