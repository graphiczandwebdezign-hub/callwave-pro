const authService = require('../services/authService');

/**
 * Authentication middleware.
 *
 *  - authenticate : requires a valid Bearer token; 401 otherwise.
 *  - optionalAuth : attaches req.user if a valid token is present, but lets
 *                   unauthenticated requests through (used on legacy endpoints
 *                   so existing clients keep working during the rollout).
 *
 * Token may be sent as  Authorization: Bearer <token>
 */

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

function attachUser(req, token) {
  if (authService.isRevoked(token)) return { revoked: true };
  try {
    const payload = authService.verifyToken(token);
    req.user = { id: payload.sub, username: payload.username };
    req.token = token;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
  }
  const result = attachUser(req, token);
  if (result.revoked) {
    return res.status(401).json({ error: 'Token has been revoked', code: 'TOKEN_REVOKED' });
  }
  if (!result.ok) {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'BAD_TOKEN' });
  }
  next();
}

function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) attachUser(req, token); // best-effort; ignore failures
  next();
}

module.exports = {
  authenticate,
  optionalAuth,
};
