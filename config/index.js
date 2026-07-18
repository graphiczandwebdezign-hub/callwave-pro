const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/**
 * Centralised, immutable application configuration.
 * All runtime settings are read from the environment here (and only here),
 * so the rest of the codebase depends on this single source of truth.
 *
 * Sprint 1B adds: Supabase (DB + Storage), Redis (token revocation), and a
 * toggle to enforce socket authentication. Each is *optional* — when its env
 * vars are absent the app falls back to the local JSON/file/memory backends.
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
    'FATAL: JWT_SECRET is missing or insecure. Set it in the deployment environment ' +
      '(Render: Environment; Vercel: Project Settings > Environment Variables).'
  );
}

// ---- Supabase (optional) --------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseEnabled = !!(supabaseUrl && supabaseServiceRoleKey);

if (isProd && process.env.SUPABASE_URL && !supabaseServiceRoleKey) {
  // eslint-disable-next-line no-console
  console.warn('[config] SUPABASE_URL set but SUPABASE_SERVICE_ROLE_KEY missing — DB disabled.');
}

// ---- Object storage (optional) -------------------------------------------
// 'supabase' when Supabase is on AND a bucket is configured, else local FS.
const storageProvider =
  process.env.STORAGE_PROVIDER ||
  (supabaseEnabled && process.env.SUPABASE_STORAGE_BUCKET ? 'supabase' : 'local');

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
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m', // kept as the access-token TTL alias
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
  /** When true, socket connections without a valid JWT are rejected. */
  socketAuthRequired: process.env.SOCKET_AUTH_REQUIRED === 'true',

  // Logging
  logLevel: (process.env.LOG_LEVEL || (isProd ? 'info' : 'debug')).toLowerCase(),
  logFormat: (process.env.LOG_FORMAT || (isProd ? 'json' : 'pretty')).toLowerCase(),

  // Filesystem
  publicDir,
  uploadDir,
  dataDir,

  // Supabase / DB
  supabase: Object.freeze({
    enabled: supabaseEnabled,
    url: supabaseUrl,
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: supabaseServiceRoleKey,
  }),

  // Object storage
  storage: Object.freeze({
    provider: storageProvider,
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'voicemails',
  }),

  // Redis (token revocation) — optional
  redis: Object.freeze({
    url: process.env.REDIS_URL || null,
  }),
});
