const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Centralised, immutable application configuration.
 * All runtime settings are read from the environment here (and only here),
 * so the rest of the codebase depends on this single source of truth.
 */
const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const isDev = !isProd;
const isVercel = !!process.env.VERCEL;

// Filesystem layout. Vercel exposes a read-only FS except /tmp.
const projectRoot = path.join(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const uploadDir = isVercel
  ? path.join('/tmp', 'uploads')
  : path.join(publicDir, 'uploads');
const dataDir = isVercel ? path.join('/tmp', 'data') : path.join(projectRoot, 'data');

// Ensure required directories exist (no-op if already present).
for (const dir of [uploadDir, dataDir]) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    // Directory creation may fail on read-only/ephemeral FS — handled gracefully.
    // eslint-disable-next-line no-console
    console.error(`[config] could not create ${dir}: ${err.message}`);
  }
}

const jwtSecret = process.env.JWT_SECRET;
if (isProd && (!jwtSecret || jwtSecret === 'replace-me-with-a-long-random-secret')) {
  // Fail fast in production rather than running with an insecure/placeholder secret.
  throw new Error(
    'FATAL: JWT_SECRET must be set to a strong random value in production. See .env.example.'
  );
}

module.exports = Object.freeze({
  env,
  isProd,
  isDev,
  isVercel,
  platform: isVercel ? 'vercel' : 'standard',
  projectRoot,

  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Auth
  jwtSecret: jwtSecret || (isProd ? undefined : 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,

  // Logging
  logLevel: (process.env.LOG_LEVEL || (isProd ? 'info' : 'debug')).toLowerCase(),
  logFormat: (process.env.LOG_FORMAT || (isProd ? 'json' : 'pretty')).toLowerCase(),

  // Filesystem
  publicDir,
  uploadDir,
  dataDir,
});
