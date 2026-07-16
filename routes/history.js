const express = require('express');
const callService = require('../services/callService');
const { ownUserOrLegacy } = require('../middleware/ownUser');

const router = express.Router();

// GET /api/history/:username  (authenticated users restricted to their own)
router.get('/history/:username', ownUserOrLegacy, async (req, res, next) => {
  try {
    const list = await callService.historyFor(req.params.username);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
