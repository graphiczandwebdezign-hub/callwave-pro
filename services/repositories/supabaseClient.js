const { createClient } = require('@supabase/supabase-js');
const config = require('../../config');
const logger = require('../../utils/logger');

const log = logger.child({ module: 'supabaseClient' });

/**
 * Lazy singleton Supabase client.
 *
 * Uses the service-role key so server-side data operations bypass RLS (the
 * server is trusted). RLS policies in db/schema.sql still protect direct
 * client/anon-key access. The client is only created when Supabase is enabled,
 * so the dependency never initialises in local/fallback mode.
 */
let client = null;

function getClient() {
  if (client) return client;
  if (!config.supabase.enabled) {
    throw new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).');
  }
  client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  log.info('supabase client initialised', { url: config.supabase.url });
  return client;
}

/** True if a client has been created in this process. */
function isInitialised() {
  return client !== null;
}

module.exports = { getClient, isInitialised };
