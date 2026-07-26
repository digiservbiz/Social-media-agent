const axios = require('axios');
const BaseAdapter = require('./base');

const GRAPH = 'https://graph.facebook.com/v21.0';

// Handles both Facebook Pages and Instagram Business accounts, since Meta's
// Graph API issues one long-lived Page token that covers both.
class MetaAdapter extends BaseAdapter {
  constructor(platform = 'facebook') {
    super(platform); // 'facebook' or 'instagram'
    this.appId = process.env.META_APP_ID;
    this.appSecret = process.env.META_APP_SECRET;
    this.redirectUri = process.env.META_REDIRECT_URI;
  }

  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      state,
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish'
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  }

  async handleCallback({ code }) {
    // 1. Exchange code for short-lived user token
    const shortLived = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: {
        client_id: this.appId,
        client_secret: this.appSecret,
        redirect_uri: this.redirectUri,
        code
      }
    });

    // 2. Exchange for a long-lived user token (~60 days)
    const longLived = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: this.appId,
        client_secret: this.appSecret,
        fb_exchange_token: shortLived.data.access_token
      }
    });

    // 3. Get the Pages this user manages — each Page token doesn't expire
    //    as long as the user token stays valid.
    const pages = await axios.get(`${GRAPH}/me/accounts`, {
      params: { access_token: longLived.data.access_token }
    });

    if (!pages.data.data.length) {
      throw new Error('No Facebook Pages found for this account. You need to manage at least one Page.');
    }

    // For simplicity, connect the first Page. Extend this to let the user pick
    // if they manage multiple Pages.
    const page = pages.data.data[0];

    let igAccountId = null;
    try {
      const igRes = await axios.get(`${GRAPH}/${page.id}`, {
        params: { fields: 'instagram_business_account', access_token: page.access_token }
      });
      igAccountId = igRes.data.instagram_business_account?.id || null;
    } catch (_) { /* no linked IG account, fine */ }

    return {
      platformUserId: page.id,
      displayName: page.name,
      accessToken: page.access_token, // long-lived Page token
      meta: { igAccountId }
    };
  }

  async publish(account, content) {
    if (this.platform === 'instagram') {
      const igId = account.meta?.igAccountId;
      if (!igId) throw new Error('No Instagram Business account linked to this Page.');
      if (!content.mediaUrls?.length) throw new Error('Instagram requires at least one image or video URL.');

      const container = await axios.post(`${GRAPH}/${igId}/media`, null, {
        params: {
          image_url: content.mediaUrls[0],
          caption: content.text,
          access_token: account.accessToken
        }
      });
      const publish = await axios.post(`${GRAPH}/${igId}/media_publish`, null, {
        params: { creation_id: container.data.id, access_token: account.accessToken }
      });
      return { success: true, remotePostId: publish.data.id };
    }

    // Facebook Page post
    const res = await axios.post(`${GRAPH}/${account.platformUserId}/feed`, null, {
      params: {
        message: content.text,
        link: content.link || undefined,
        access_token: account.accessToken
      }
    });
    return { success: true, remotePostId: res.data.id };
  }
}

module.exports = MetaAdapter;
