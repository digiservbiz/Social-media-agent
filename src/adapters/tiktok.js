const axios = require('axios');
const BaseAdapter = require('./base');

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const API_BASE = 'https://open.tiktokapis.com/v2';

// NOTE: TikTok's Content Posting API works unreviewed only in sandbox mode
// (posts land as private/draft, visible only to your own test account).
// Public posting requires submitting the app for review — free, but takes
// a few days. This adapter is wired for when that approval lands; until
// then, expect publish() to succeed only against sandboxed test users.
class TikTokAdapter extends BaseAdapter {
  constructor() {
    super('tiktok');
    this.clientKey = process.env.TIKTOK_CLIENT_KEY;
    this.clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    this.redirectUri = process.env.TIKTOK_REDIRECT_URI;
  }

  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_key: this.clientKey,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'user.info.basic,video.publish',
      state
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async handleCallback({ code }) {
    const tokenRes = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token, refresh_token, expires_in, open_id } = tokenRes.data;
    return {
      platformUserId: open_id,
      displayName: open_id,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000
    };
  }

  async publish(account, content) {
    if (!content.mediaUrls?.length) {
      throw new Error('TikTok requires a video URL — text-only posts are not supported.');
    }
    const res = await axios.post(
      `${API_BASE}/post/publish/video/init/`,
      {
        post_info: { title: content.text },
        source_info: { source: 'PULL_FROM_URL', video_url: content.mediaUrls[0] }
      },
      { headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' } }
    );
    return { success: true, remotePostId: res.data.data?.publish_id };
  }

  // Note: remotePostId from publish() is a publish_id, not the final video_id —
  // TikTok processes the upload asynchronously. Stats lookup here assumes the
  // publish_id can be resolved to a video_id via the same list endpoint;
  // in practice you may need to map publish_id -> video_id once processing
  // completes (poll /post/publish/status/fetch/ first).
  async getPostStats(account, remoteVideoId) {
    const res = await axios.post(
      `${API_BASE}/video/query/`,
      { filters: { video_ids: [remoteVideoId] } },
      {
        params: { fields: 'view_count,like_count,comment_count,share_count' },
        headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' }
      }
    );
    const v = res.data.data?.videos?.[0] || {};
    return {
      views: v.view_count ?? null,
      likes: v.like_count ?? null,
      comments: v.comment_count ?? null,
      shares: v.share_count ?? null
    };
  }
}

module.exports = TikTokAdapter;
