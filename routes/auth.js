const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /auth/register  ->  { success, user, token }
router.post('/register', asyncHandler(async (req, res) => {
  const { user, token } = await authService.register(req.body);
  res.status(201).json({ success: true, user, token });
}));

// POST /auth/login  ->  { success, user, token }
router.post('/login', asyncHandler(async (req, res) => {
  const { user, token } = await authService.login(req.body);
  res.json({ success: true, user, token });
}));

// GET /auth/me  ->  { success, user }   (requires Bearer token)
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, user: req.user });
});

// POST /auth/logout  ->  { success }   (revokes current token)
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await authService.revokeToken(req.token);
  res.json({ success: true, message: 'Logged out' });
}));

module.exports = router;
