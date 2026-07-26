const express = require('express');
const { generateCaptions } = require('../ai');

const router = express.Router();

// POST /api/captions/generate
// body: { topic: "...", platforms: ["linkedin","x","instagram"] }
router.post('/generate', async (req, res) => {
  const { topic, platforms } = req.body;
  if (!topic || !platforms?.length) {
    return res.status(400).json({ error: 'topic and platforms[] are required' });
  }
  try {
    const captions = await generateCaptions(topic, platforms);
    res.json({ success: true, captions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
