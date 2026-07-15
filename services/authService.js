const jwt = require('jsonwebtoken');
const config = require('../config');
const userService = require('./userService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const log = logger.child({ module: 'authService' });

/**
 * Authentication logic: registration, login, JWT issue/verify, and a simple
 * in-memory token revocation list used by the /auth/logout flow.
 */

// --- token helpers ---------------------------------------------------------
function generateToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
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
  const token = generateToken(user);
  log.info('user registered', { username: user.username });
  return { user, token };
}

async function login({ username, password }) {
  assertCredentials(username, password);
  const user = await userService.verifyCredentials(username, password);
  if (!user) {
    throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
  }
  const token = generateToken(user);
  log.info('user logged in', { username: user.username });
  return { user: userService.toPublic(user), token };
}

// --- revocation (stateless logout) ----------------------------------------
// A lightweight in-memory blacklist of revoked tokens, pruned as they expire.
// Suitable for Sprint 1A single-instance deployments; a persistent store
// (Redis / DB) is the Sprint 1B upgrade path.
const revoked = new Set();

function revokeToken(token) {
  revoked.add(token);
  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      const ms = decoded.exp * 1000 - Date.now();
      const handle = setTimeout(() => revoked.delete(token), Math.max(ms, 0));
      if (handle.unref) handle.unref();
    }
  } catch {
    /* ignore */
  }
  log.info('token revoked');
}

function isRevoked(token) {
  return revoked.has(token);
}

module.exports = {
  register,
  login,
  generateToken,
  verifyToken,
  revokeToken,
  isRevoked,
};
