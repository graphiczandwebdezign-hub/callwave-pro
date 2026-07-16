const jwt = require('jsonwebtoken');
const config = require('../config');
const userService = require('./userService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const log = logger.child({ module: 'authService' });

/**
 * Authentication logic: registration, login, JWT issue/verify, token refresh,
 * and a pluggable revocation store used by the /auth/logout flow.
 *
 * Two token types:
 *   - access  : short-lived (default 15m); authorises REST + Socket.IO.
 *   - refresh : long-lived (default 7d); only valid at POST /auth/refresh.
 * Both carry a `tokenUse` claim so an access token can't refresh and a refresh
 * token can't authenticate a request.
 */

// --- token helpers ---------------------------------------------------------
function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, tokenUse: 'access' },
    config.jwtSecret,
    { expiresIn: config.jwtAccessExpiresIn }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, tokenUse: 'refresh' },
    config.jwtSecret,
    { expiresIn: config.jwtRefreshExpiresIn }
  );
}

// Legacy alias kept for any older callers/tests.
function generateToken(user) {
  return generateAccessToken(user);
}

/**
 * Verify a token and enforce its `tokenUse` matches `expected`.
 * Defaults to 'access' so REST + socket callers reject refresh tokens.
 */
function verifyToken(token, expected = 'access') {
  const payload = jwt.verify(token, config.jwtSecret);
  if (payload.tokenUse && payload.tokenUse !== expected) {
    const err = new Error(`Expected a ${expected} token, got ${payload.tokenUse}`);
    err.name = 'TokenUseError';
    throw err;
  }
  return payload;
}

function verifyAccessToken(token) {
  return verifyToken(token, 'access');
}

function verifyRefreshToken(token) {
  return verifyToken(token, 'refresh');
}

// --- validation ------------------------------------------------------------
function assertCredentials(username, password) {
  if (!username || normalize(username).length < 2) {
    throw new AppError('Username must be at least 2 characters', 400, 'VALIDATION');
  }
  if (!password || password.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400, 'VALIDATION');
  }
}

function normalize(username) {
  return userService.normalize(username);
}

// --- public flows ----------------------------------------------------------
async function register({ username, password }) {
  assertCredentials(username, password);
  const user = await userService.createUser({ username, password });
  log.info('user registered', { username: user.username });
  return issueTokens(user);
}

async function login({ username, password }) {
  assertCredentials(username, password);
  const user = await userService.verifyCredentials(username, password);
  if (!user) {
    throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
  }
  log.info('user logged in', { username: user.username });
  return issueTokens(userService.toPublic(user));
}

/** Issue a fresh access + refresh token pair for a public user object. */
function issueTokens(user) {
  return {
    user,
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
  };
}

/**
 * Exchange a valid refresh token for a new access token.
 * Revoked or access-type tokens are rejected.
 */
async function refresh(refreshToken) {
  if (!refreshToken) {
    throw new AppError('Refresh token required', 400, 'NO_REFRESH_TOKEN');
  }
  if (await isRevoked(refreshToken)) {
    throw new AppError('Refresh token has been revoked', 401, 'TOKEN_REVOKED');
  }
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    throw new AppError('Invalid or expired refresh token', 401, 'BAD_REFRESH_TOKEN');
  }
  const accessToken = generateAccessToken({ id: payload.sub, username: payload.username });
  log.debug('access token refreshed', { username: payload.username });
  return { accessToken };
}

// --- revocation (stateless logout) ----------------------------------------
// Backed by the pluggable tokenStore: in-memory (default) or Redis (when
// REDIS_URL is set) so revocation is shared across instances / serverless.
const tokenStore = require('./tokenStore');

async function revokeToken(token) {
  await tokenStore.add(token);
  log.info('token revoked', { backend: config.redis.url ? 'redis' : 'memory' });
}

async function isRevoked(token) {
  return tokenStore.has(token);
}

module.exports = {
  register,
  login,
  refresh,
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  verifyAccessToken,
  verifyRefreshToken,
  revokeToken,
  isRevoked,
};
