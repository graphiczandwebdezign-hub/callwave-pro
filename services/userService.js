const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./dataService');
const AppError = require('../utils/AppError');

/**
 * User account management.
 * Owns password hashing and account persistence via the data layer.
 */

/** Strip sensitive fields before returning a user to the client. */
function toPublic(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

function normalize(username) {
  return String(username || '').trim().toLowerCase();
}

async function createUser({ username, password }) {
  const name = normalize(username);
  const existing = await db.accounts.findOne((u) => u.username === name);
  if (existing) {
    throw new AppError('Username already taken', 409, 'USERNAME_TAKEN');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const now = Date.now();
  const user = {
    id: uuidv4(),
    username: name,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };
  await db.accounts.insert(user);
  return toPublic(user);
}

async function findByUsername(username) {
  return db.accounts.findOne((u) => u.username === normalize(username));
}

/** Returns the full user record (incl. hash) if credentials match, else null. */
async function verifyCredentials(username, password) {
  const user = await findByUsername(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

module.exports = {
  normalize,
  toPublic,
  createUser,
  findByUsername,
  verifyCredentials,
};
