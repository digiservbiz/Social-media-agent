const LinkedInAdapter = require('./linkedin');
const MetaAdapter = require('./meta');
const XAdapter = require('./x');
const TikTokAdapter = require('./tiktok');

const registry = {
  linkedin: new LinkedInAdapter(),
  facebook: new MetaAdapter('facebook'),
  instagram: new MetaAdapter('instagram'),
  x: new XAdapter(),
  tiktok: new TikTokAdapter()
};

function getAdapter(platform) {
  const adapter = registry[platform];
  if (!adapter) throw new Error(`Unknown platform: ${platform}`);
  return adapter;
}

module.exports = { registry, getAdapter };
