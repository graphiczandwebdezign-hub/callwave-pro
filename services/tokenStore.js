const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');

const log = logger.child({ module: 'tokenStore' });

/**
 * JWT revocation store — used by the /auth/logout flow to invalidate a token
 * before its natural expiry.
 *
 * Two implementations, selected by environment:
 *   - default        : in-memory Set, auto-pruned as tokens expire
 *                      (single-process; zero deps)
 *   - REDIS_URL set  : Redis-backed SET with per-token TTL
 *                      (shared across instances / serverless)
 *
 * Interface: add(token) / has(token) — both async to fit the Redis path.
 */

// ------------------------------------------------------------- in-memory impl
class MemoryTokenStore {
  constructor() {
    this._set = new Set();
  }
  async add(token) {
    this._set.add(token);
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        const ms = decoded.exp * 1000 - Date.now();
        const handle = setTimeout(() => this._set.delete(token), Math.max(ms, 0));
        if (handle.unref) handle.unref();
      }
    } catch {
      /* ignore malformed token */
    }
  }
  async has(token) {
    return this._set.has(token);
  }
}

// ----------------------------------------------------------------- redis impl
class RedisTokenStore {
  constructor(url) {
    // Lazy require: ioredis is only needed when Redis is configured.
    const Redis = require('ioredis');
    this._redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    this._prefix = 'callwave:revoked:';
    log.info('redis token store connected', { url: url.replace(/:\/\/.*@/, '://***@') });
  }
  _key(token) {
    // Derive a stable key from the JWT signature (last segment) — avoids
    // storing the full token and keeps keys short.
    const sig = String(token).split('.').pop();
    return `${this._prefix}${sig}`;
  }
  async add(token) {
    let ttl = 0;
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) ttl = Math.max(decoded.exp - Math.floor(Date.now() / 1000), 1);
    } catch {
      ttl = 60 * 60; // fallback 1h
    }
    await this._redis.set(this._key(token), '1', 'EX', ttl);
  }
  async has(token) {
    const r = await this._redis.get(this._key(token));
    return r !== null;
  }
}

// ----------------------------------------------------------------- selection
let store = null;
function getStore() {
  if (store) return store;
  store = config.redis.url ? new RedisTokenStore(config.redis.url) : new MemoryTokenStore();
  log.info('token store initialised', { backend: config.redis.url ? 'redis' : 'memory' });
  return store;
}

function add(token) {
  return getStore().add(token);
}
function has(token) {
  return getStore().has(token);
}

module.exports = { add, has, getStore };
