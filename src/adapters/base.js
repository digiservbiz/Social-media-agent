// Every platform adapter implements this shape:
//   getAuthUrl(state)            -> string, where to send the user to connect
//   handleCallback(query)        -> { platformUserId, displayName, accessToken, refreshToken?, expiresAt? }
//   publish(account, content)    -> { success, remotePostId, url? }
//   refreshTokenIfNeeded(account)-> account (possibly with updated token), or throws
//   getPostStats(account, remotePostId) -> { views, likes, comments, shares } (nulls for unsupported fields)
//
// content shape passed to publish(): { text, mediaUrls: [], link? }
class BaseAdapter {
  constructor(platform) {
    this.platform = platform;
  }
  getAuthUrl() { throw new Error(`${this.platform}: getAuthUrl not implemented`); }
  async handleCallback() { throw new Error(`${this.platform}: handleCallback not implemented`); }
  async publish() { throw new Error(`${this.platform}: publish not implemented`); }
  async refreshTokenIfNeeded(account) { return account; }
  async getPostStats() { throw new Error(`${this.platform}: getPostStats not implemented`); }
}

module.exports = BaseAdapter;
