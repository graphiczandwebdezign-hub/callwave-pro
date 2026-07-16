const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

const log = logger.child({ module: 'storageService' });

/**
 * Voicemail audio storage abstraction.
 *
 * Two providers, selected by `config.storage.provider`:
 *   - 'local'   : writes to the filesystem under /uploads (served statically)
 *   - 'supabase': uploads to a Supabase Storage bucket, returns a public URL
 *
 * Both expose the same async interface so the upload route is provider-agnostic.
 *   save({ buffer, filename, contentType }) -> { key, url }
 *   remove(key)                              -> void
 *   urlFor(key)                              -> string  (sync)
 *   getProvider()                            -> 'local' | 'supabase'
 */

// ----------------------------------------------------------------- local FS
const local = {
  async save({ buffer, filename }) {
    const dest = path.join(config.uploadDir, filename);
    fs.writeFileSync(dest, buffer);
    return { key: filename, url: `/uploads/${filename}` };
  },
  async remove(key) {
    try {
      fs.unlinkSync(path.join(config.uploadDir, key));
    } catch (err) {
      log.warn('local remove failed', { key, error: err.message });
    }
  },
  urlFor(key) {
    return `/uploads/${key}`;
  },
};

// -------------------------------------------------------------- supabase storage
let _supabaseStorage = null;
function getSupabaseStorage() {
  if (_supabaseStorage) return _supabaseStorage;
  // Lazy require so the Supabase SDK never loads in local mode.
  const { getClient } = require('./repositories/supabaseClient');
  _supabaseStorage = {
    client: getClient(),
    bucket: config.storage.bucket,
  };
  return _supabaseStorage;
}

const supabase = {
  async save({ buffer, filename, contentType }) {
    const { client, bucket } = getSupabaseStorage();
    const { error } = await client.storage
      .from(bucket)
      .upload(filename, buffer, { contentType: contentType || 'audio/webm', upsert: false });
    if (error) {
      log.error('supabase storage upload failed', { filename, error: error.message });
      throw new Error(`[storage] ${error.message}`);
    }
    return { key: filename, url: this.urlFor(filename) };
  },
  async remove(key) {
    const { client, bucket } = getSupabaseStorage();
    const { error } = await client.storage.from(bucket).remove([key]);
    if (error) log.warn('supabase storage remove failed', { key, error: error.message });
  },
  urlFor(key) {
    const base = `${config.supabase.url}/storage/v1/object/public/${config.storage.bucket}`;
    return `${base}/${key}`;
  },
};

// ----------------------------------------------------------------- selection
function getProvider() {
  return config.storage.provider === 'supabase' ? supabase : local;
}

function save(opts) {
  return getProvider().save(opts);
}
function remove(key) {
  return getProvider().remove(key);
}
function urlFor(key) {
  return getProvider().urlFor(key);
}

log.info('storage provider initialised', {
  provider: config.storage.provider,
  bucket: config.storage.bucket,
});

module.exports = {
  save,
  remove,
  urlFor,
  getProvider,
};
