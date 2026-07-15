const express = require('express');
const callService = require('../services/callService');

const router = express.Router();

// GET /api/history/:username
router.get('/history/:username', async (req, res, next) => {
  try {
    const list = await callService.historyFor(req.params.username);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
