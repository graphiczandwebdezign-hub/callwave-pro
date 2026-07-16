const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../../utils/logger');

const log = logger.child({ module: 'jsonRepository' });

/**
 * JSON-file-backed repository implementing the shared repository interface.
 *
 * Each collection is one file in `config.dataDir` (e.g. `data/accounts.json`).
 * Used as the local-development / fallback backend; selected automatically by
 * `services/dataService` when Supabase is not configured.
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

module.exports = JsonRepository;
