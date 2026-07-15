const { v4: uuidv4 } = require('uuid');
const db = require('./dataService');

/**
 * Call-history persistence. All mutations go through the data layer so the
 * storage backend can be swapped in Sprint 1B without touching signalling.
 */

async function record({ id, from, to, status, timestamp, duration }) {
  const doc = {
    id: id || uuidv4(),
    from,
    to,
    status,
    timestamp: timestamp || Date.now(),
    duration: duration || 0,
  };
  await db.calls.insert(doc);
  return doc;
}

async function findById(id) {
  return db.calls.findById(id);
}

async function updateById(id, patch) {
  return db.calls.updateById(id, patch);
}

/** All calls involving `username`, newest first (matches the original API). */
async function historyFor(username) {
  const all = await db.calls.all();
  return all
    .filter((c) => c.from === username || c.to === username)
    .sort((a, b) => b.timestamp - a.timestamp);
}

module.exports = {
  record,
  findById,
  updateById,
  historyFor,
};
