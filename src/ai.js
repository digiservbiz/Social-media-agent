const axios = require('axios');

// Thin wrapper around OpenRouter's chat completions API for two jobs:
//  1. Drafting platform-specific captions from a topic
//  2. Drafting a reply to an inbound comment
// Both return text only — nothing gets posted automatically. The caller
// (routes/comments.js, routes/captions.js) is responsible for the human
// approval step before anything goes live.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function chat(prompt, model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku') {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set in .env — AI features are disabled until it is.');
  }
  const res = await axios.post(OPENROUTER_URL, {
    model,
    messages: [{ role: 'user', content: prompt }]
  }, {
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  return res.data.choices?.[0]?.message?.content?.trim() || '';
}

const PLATFORM_STYLE = {
  linkedin: 'Professional tone, 2-4 short paragraphs, no hashtags spam (max 3), can include a soft call to action.',
  facebook: 'Conversational, friendly, medium length, 1-2 relevant emojis okay.',
  instagram: 'Punchy, visual-first caption, line breaks between thoughts, up to 10 relevant hashtags at the end.',
  x: 'Under 280 characters, punchy, no more than 1-2 hashtags.',
  tiktok: 'Very short, hook-driven caption, casual tone, 2-3 trending-style hashtags.'
};

async function generateCaptions(topic, platforms) {
  const results = {};
  await Promise.all(platforms.map(async (platform) => {
    const style = PLATFORM_STYLE[platform] || 'Neutral tone, medium length.';
    const prompt = `Write a single social media post caption about: "${topic}"\n\nPlatform: ${platform}\nStyle guide: ${style}\n\nReturn only the caption text, no explanation, no quotation marks around it.`;
    try {
      results[platform] = await chat(prompt);
    } catch (err) {
      results[platform] = null;
      results[`${platform}_error`] = err.response?.data?.error?.message || err.message;
    }
  }));
  return results;
}

async function generateCommentReply(originalPostText, commentText, tone = 'friendly and helpful') {
  const prompt = `You're replying to a comment on a social media post as the page/brand owner.

Original post: "${originalPostText}"
Comment from a user: "${commentText}"

Write a short, ${tone} reply (1-2 sentences max). Do not solicit likes, follows, or engagement — just respond genuinely to what they said. Return only the reply text.`;
  return chat(prompt);
}

module.exports = { generateCaptions, generateCommentReply };
