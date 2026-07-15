const express = require('express');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Apply optional auth globally so authenticated clients are recognised on
// legacy endpoints, while unauthenticated clients (the current SPA) keep working.
router.use(optionalAuth);

// Existing APIs (paths unchanged for backward compatibility)
router.use('/api', require('./health'));
router.use('/api', require('./voicemail'));
router.use('/api', require('./history'));

// New authentication endpoints
router.use('/auth', require('./auth'));

module.exports = router;
