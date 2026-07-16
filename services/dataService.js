const config = require('../config');
const logger = require('../utils/logger');
const JsonRepository = require('./repositories/jsonRepository');
const SupabaseRepository = require('./repositories/supabaseRepository');

const log = logger.child({ module: 'dataService' });

/**
 * Data layer factory.
 *
 * Picks the backend per process: Supabase repositories when credentials are
 * present, otherwise the JSON-file repositories from Sprint 1A. Either way the
 * exported `db` object exposes the SAME async repository interface, so every
 * consumer (user/call/voicemail services, routes) is backend-agnostic.
 *
 * >>> This is the Supabase swap point introduced in Sprint 1A. <<<
 */
const useSupabase = config.supabase.enabled;
const Repository = useSupabase ? SupabaseRepository : JsonRepository;

// Per-table config. `fieldMap` maps JS keys to DB columns for SQL reserved
// words (from/to) so callers keep using the natural camelCase names.
const tables = [
  { name: 'accounts' },
  { name: 'calls', fieldMap: { from: 'from_user', to: 'to_user' } },
  { name: 'voicemails', fieldMap: { from: 'from_user', to: 'to_user' } },
];

const db = {};
for (const t of tables) {
  db[t.name] = new Repository(t.name, { fieldMap: t.fieldMap || {} });
}

log.info('data layer initialised', {
  backend: useSupabase ? 'supabase' : 'json',
  platform: config.platform,
  dataDir: config.dataDir,
  collections: Object.keys(db),
});

module.exports = db;
module.exports.backend = useSupabase ? 'supabase' : 'json';
module.exports.JsonRepository = JsonRepository;
module.exports.SupabaseRepository = SupabaseRepository;
