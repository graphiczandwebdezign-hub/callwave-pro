/**
 * Data-layer tests (Sprint 1B).
 *
 * Verifies:
 *  1. The factory selects the JSON backend when Supabase is unconfigured.
 *  2. The shared repository contract (all/find/findOne/findById/insert/
 *     updateById/removeById) works end-to-end on the JSON backend.
 *  3. The Supabase repository's camelCase<->snake_case + reserved-word field
 *     mapping is correct (unit-tested without a live database connection).
 *
 * No running server required.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../services/dataService');
const JsonRepository = require('../services/repositories/jsonRepository');
const SupabaseRepository = require('../services/repositories/supabaseRepository');

const results = [];
const ok = (m) => { results.push(true); console.log('✅ ' + m); };
const bad = (m) => { results.push(false); console.log('❌ ' + m); };
function assert(cond, msg) { cond ? ok(msg) : bad(msg); }

(async () => {
  // 1. Backend selection ----------------------------------------------------
  assert(
    db.backend === 'json',
    `factory selects 'json' when Supabase unconfigured (got '${db.backend}')`
  );
  assert(
    config.supabase.enabled === false,
    'config.supabase.enabled is false without credentials'
  );

  // 2. Repository contract on a scratch JSON collection ---------------------
  const repo = new JsonRepository('__test_scratch');
  await repo.insert({ id: 'a', name: 'alice', n: 1 });
  await repo.insert({ id: 'b', name: 'bob', n: 2 });
  assert((await repo.all()).length === 2, 'all() returns inserted docs');
  assert((await repo.findById('a')).name === 'alice', 'findById returns the doc');
  assert((await repo.findOne((d) => d.name === 'bob')).id === 'b', 'findOne(predicate)');
  assert((await repo.find((d) => d.n > 1)).length === 1, 'find(predicate) filters');
  const upd = await repo.updateById('a', { n: 10 });
  assert(upd.n === 10 && typeof upd.updatedAt === 'number', 'updateById merges + sets updatedAt');
  assert((await repo.findById('a')).n === 10, 'update persisted');
  assert((await repo.removeById('b')) === true, 'removeById returns true');
  assert(!(await repo.findById('b')), 'removed doc is gone');
  assert((await repo.all()).length === 1, 'exactly one doc remains');

  // cleanup the scratch file
  try { fs.unlinkSync(path.join(config.dataDir, '__test_scratch.json')); } catch { /* */ }

  // 3. Supabase field mapping (no connection needed) ------------------------
  const sr = new SupabaseRepository('calls', { fieldMap: { from: 'from_user', to: 'to_user' } });
  const dbRow = sr._toDb({ id: '1', from: 'alice', to: 'bob', createdAt: 123, passwordHash: 'h' });
  assert(dbRow.from_user === 'alice' && dbRow.to_user === 'bob', 'toDb maps reserved words from/to');
  assert(dbRow.created_at === 123 && dbRow.password_hash === 'h', 'toDb converts camelCase -> snake_case');

  const jsObj = sr._fromDb({ id: '1', from_user: 'alice', to_user: 'bob', created_at: 123, is_online: true });
  assert(jsObj.from === 'alice' && jsObj.to === 'bob', 'fromDb reverses reserved words');
  assert(jsObj.createdAt === 123 && jsObj.isOnline === true, 'fromDb converts snake_case -> camelCase');

  // round-trip stability
  const original = { id: '9', from: 'x', to: 'y', duration: 5, endedAt: 7, listened: true };
  const roundTrip = sr._fromDb(sr._toDb(original));
  assert(JSON.stringify(roundTrip) === JSON.stringify(original), 'toDb/fromDb round-trips losslessly');

  // report
  const passed = results.filter(Boolean).length;
  console.log('\n========================================');
  console.log(`DATA-LAYER TEST: ${passed}/${results.length} checks passed`);
  console.log('========================================');
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
