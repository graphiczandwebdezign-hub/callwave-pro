/**
 * In-memory online presence.
 *
 * Replaces the old module-level `users` / `usernameToSocket` objects in
 * server.js. Presence is intentionally ephemeral (never persisted): it only
 * tracks who is connected right now and maps a username to its live socket.
 */

// socketId -> { id, username, online, lastSeen, joinedAt }
const _users = new Map();
// username -> socketId
const _usernameToSocket = new Map();

function add(socketId, user) {
  _users.set(socketId, user);
}

function getBySocket(socketId) {
  return _users.get(socketId) || null;
}

/** Register a username->socket binding, evicting any previous socket for it. */
function setSocketFor(username, socketId) {
  const previous = _usernameToSocket.get(username);
  if (previous && previous !== socketId) {
    _users.delete(previous);
  }
  _usernameToSocket.set(username, socketId);
}

function getSocketId(username) {
  return _usernameToSocket.get(username);
}

/** Remove a socket and clear its username binding. Returns the removed user. */
function remove(socketId) {
  const user = _users.get(socketId);
  if (user) _usernameToSocket.delete(user.username);
  _users.delete(socketId);
  return user || null;
}

function list() {
  return Array.from(_users.values());
}

function count() {
  return _users.size;
}

module.exports = {
  add,
  getBySocket,
  setSocketFor,
  getSocketId,
  remove,
  list,
  count,
};
