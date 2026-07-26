// Every platform adapter implements this shape:
//   getAuthUrl(state)                    -> string, where to send the user to connect
//   handleCallback(query)                -> { platformUserId, displayName, accessToken, refreshToken?, expiresAt? }
//   publish(account, content)            -> { success, remotePostId, url? }
//   refreshTokenIfNeeded(account)        -> account (possibly with updated token), or throws
//   getPostStats(account, remotePostId)  -> { views, likes, comments, shares }
//   getFollowerCount(account)            -> number | null
//   listComments(account, remotePostId)  -> [{ id, text, authorName, createdAt }]
//   replyToComment(account, commentId, text) -> { success, remoteCommentId }
//   listConversations(account)           -> [{ id, participantName, lastMessage, updatedAt }]
//   getMessages(account, conversationId)  -> [{ id, from, text, at, fromPage }]
//   sendMessage(account, conversationId, text) -> { success, remoteMessageId }
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
  async getFollowerCount() { return null; }
  async listComments() { return []; }
  async replyToComment() { throw new Error(`${this.platform}: replyToComment not implemented`); }
  async listConversations() { throw new Error(`${this.platform}: direct messages are not supported by this adapter`); }
  async getMessages() { throw new Error(`${this.platform}: direct messages are not supported by this adapter`); }
  async sendMessage() { throw new Error(`${this.platform}: direct messages are not supported by this adapter`); }
}

module.exports = BaseAdapter;
