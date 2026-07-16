const { getClient } = require('./supabaseClient');
const logger = require('../../utils/logger');

const log = logger.child({ module: 'supabaseRepository' });

// camelCase <-> snake_case converters (used for keys NOT in an explicit fieldMap).
const SNAKE = /([A-Z])/g;
const CAMEL = /_([a-z])/g;
const toSnake = (s) => s.replace(SNAKE, '_$1').toLowerCase();
const toCamel = (s) => s.replace(CAMEL, (_, c) => c.toUpperCase());

/**
 * Supabase/Postgres-backed repository implementing the SAME interface as
 * JsonRepository, so it is a transparent drop-in selected by `dataService`
 * when Supabase credentials are present.
 *
 * Field mapping:
 *  - Explicit `fieldMap` handles SQL reserved words (e.g. JS `from`/`to` ->
 *    columns `from_user`/`to_user`).
 *  - Everything else converts camelCase <-> snake_case automatically
 *    (passwordHash -> password_hash, createdAt -> created_at, ...).
 *
 * Note on find/findOne: because callers pass an opaque JS predicate, these
 * fetch all rows and filter in memory (correct, uniform interface). Hot
 * primary-key lookups (findById/updateById/removeById) use indexed queries.
 */
class SupabaseRepository {
  constructor(name, { fieldMap = {} } = {}) {
    this.name = name;
    this.fieldMap = fieldMap;
    this.reverseFieldMap = {};
    for (const [js, db] of Object.entries(fieldMap)) this.reverseFieldMap[db] = js;
  }

  _toDb(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k in this.fieldMap ? this.fieldMap[k] : toSnake(k)] = v;
    }
    return out;
  }

  _fromDb(row) {
    if (!row) return null;
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[k in this.reverseFieldMap ? this.reverseFieldMap[k] : toCamel(k)] = v;
    }
    return out;
  }

  async _query(promise) {
    const { data, error } = await promise;
    if (error) {
      log.error('supabase query failed', { table: this.name, error: error.message });
      throw new Error(`[supabase:${this.name}] ${error.message}`);
    }
    return data;
  }

  async all() {
    const rows = await this._query(getClient().from(this.name).select('*'));
    return rows.map((r) => this._fromDb(r));
  }

  async findById(id) {
    const row = await this._query(
      getClient().from(this.name).select('*').eq('id', id).maybeSingle()
    );
    return this._fromDb(row);
  }

  async findOne(predicate) {
    const all = await this.all();
    return all.find(predicate) || null;
  }

  async find(predicate) {
    const all = await this.all();
    return all.filter(predicate);
  }

  async insert(doc) {
    const row = await this._query(
      getClient().from(this.name).insert(this._toDb(doc)).select().single()
    );
    return this._fromDb(row);
  }

  async updateById(id, patch) {
    const row = await this._query(
      getClient().from(this.name).update(this._toDb(patch)).eq('id', id).select().maybeSingle()
    );
    return this._fromDb(row);
  }

  async removeById(id) {
    await this._query(getClient().from(this.name).delete().eq('id', id));
    return true;
  }
}

module.exports = SupabaseRepository;
