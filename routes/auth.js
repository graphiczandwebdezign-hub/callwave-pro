const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Extract a Bearer token from the Authorization header, if present.
function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

// POST /auth/register  ->  { success, user, accessToken, refreshToken, token }
router.post('/register', asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.register(req.body);
  res.status(201).json({ success: true, user, accessToken, refreshToken, token: accessToken });
}));

// POST /auth/login  ->  { success, user, accessToken, refreshToken, token }
router.post('/login', asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  res.json({ success: true, user, accessToken, refreshToken, token: accessToken });
}));

// POST /auth/refresh  ->  { success, accessToken }
// Accepts the refresh token as a Bearer header or in the body { refreshToken }.
router.post('/refresh', asyncHandler(async (req, res) => {
  const refreshToken = bearer(req) || req.body.refreshToken;
  const { accessToken } = await authService.refresh(refreshToken);
  res.json({ success: true, accessToken });
}));

// GET /auth/me  ->  { success, user }   (requires access token)
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, user: req.user });
});

// POST /auth/logout  ->  { success }
// Revokes the access token (and the refresh token if provided in the body).
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await authService.revokeToken(req.token);
  const refreshToken = req.body && req.body.refreshToken;
  if (refreshToken) await authService.revokeToken(refreshToken);
  res.json({ success: true, message: 'Logged out' });
}));

module.exports = router;
