const express = require('express');
const config = require('../config');
const presence = require('../services/presenceService');
const db = require('../services/dataService');

const router = express.Router();

// GET /api/health
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: config.platform,
    online: presence.count(),
    uptime: process.uptime(),
  });
});

// GET /api/stats
router.get('/stats', async (req, res) => {
  const calls = await db.calls.all();
  const voicemails = await db.voicemails.all();
  res.json({
    online: presence.count(),
    users: presence.list().map((u) => ({ username: u.username, online: u.online })),
    calls: calls.length,
    voicemails: voicemails.length,
    platform: config.platform,
  });
});

module.exports = router;
