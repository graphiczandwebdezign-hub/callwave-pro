const { v4: uuidv4 } = require('uuid');
const db = require('./dataService');

/**
 * Voicemail persistence + helpers.
 */

async function create({ from, to, file, filename, duration, transcription }) {
  const vm = {
    id: uuidv4(),
    from,
    to,
    file,
    filename: filename || (file ? file.split('/').pop() : undefined),
    timestamp: Date.now(),
    duration: duration || 0,
    listened: false,
    transcription: transcription || `Voicemail from ${from}`,
  };
  await db.voicemails.insert(vm);
  return vm;
}

/** Voicemails addressed to `username`, newest first (matches the original API). */
async function forUser(username) {
  const all = await db.voicemails.all();
  return all
    .filter((v) => v.to === username)
    .sort((a, b) => b.timestamp - a.timestamp);
}

async function findById(id) {
  return db.voicemails.findById(id);
}

async function markListened(id) {
  return db.voicemails.updateById(id, { listened: true });
}

module.exports = {
  create,
  forUser,
  findById,
  markListened,
};
