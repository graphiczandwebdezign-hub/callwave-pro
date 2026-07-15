const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

const log = logger.child({ module: 'dataService' });

/**
 * JSON-file-backed repository.
 *
 * This is the modular data layer that replaces the old inline `store.json`
 * read/write code in server.js. Each collection is a self-contained repository
 * with a small, well-defined interface (all/find/findOne/findById/insert/
 * updateById/removeById).
 *
 * >>> Sprint 1B swap-out point <<<
 * To migrate to Supabase/Postgres, implement the SAME interface against the
 * Supabase client and export those instances from here. No calling code needs
 * to change because every consumer talks to `db.<collection>` through these
 * async methods.
 */
class JsonRepository {
  constructor(name) {
    this.name = name;
    this.file = path.join(config.dataDir, `${name}.json`);
    this._cache = null;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) {
        this._cache = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      } else {
        this._cache = [];
      }
    } catch (err) {
      log.error('failed to load collection, starting empty', {
        collection: this.name,
        error: err.message,
      });
      this._cache = [];
    }
  }

  _persist() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this._cache, null, 2));
    } catch (err) {
      // Writes may fail on ephemeral/serverless FS (Vercel /tmp) — log and continue.
      log.warn('failed to persist collection', {
        collection: this.name,
        error: err.message,
      });
    }
  }

  async all() {
    return [...this._cache];
  }

  async find(predicate) {
    return this._cache.filter(predicate);
  }

  async findOne(predicate) {
    return this._cache.find(predicate) || null;
  }

  async findById(id) {
    return this._cache.find((doc) => doc.id === id) || null;
  }

  async insert(doc) {
    this._cache.push(doc);
    this._persist();
    return doc;
  }

  async updateById(id, patch) {
    const idx = this._cache.findIndex((doc) => doc.id === id);
    if (idx === -1) return null;
    this._cache[idx] = { ...this._cache[idx], ...patch, updatedAt: Date.now() };
    this._persist();
    return this._cache[idx];
  }

  async removeById(id) {
    const idx = this._cache.findIndex((doc) => doc.id === id);
    if (idx === -1) return false;
    this._cache.splice(idx, 1);
    this._persist();
    return true;
  }
}

// Single shared instances — imported everywhere as `require('./dataService')`.
const db = {
  accounts: new JsonRepository('accounts'),
  calls: new JsonRepository('calls'),
  voicemails: new JsonRepository('voicemails'),
};

log.info('data layer initialised', {
  platform: config.platform,
  dataDir: config.dataDir,
  collections: Object.keys(db),
});

module.exports = db;
module.exports.JsonRepository = JsonRepository;
