const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');
const presence = require('./presenceService');
const callService = require('./callService');
const voicemailService = require('./voicemailService');
const authService = require('./authService');
const userService = require('./userService');

const log = logger.child({ module: 'socket' });

let io = null;

function bearerFrom(header) {
  if (!header || typeof header !== 'string') return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/**
 * Attach Socket.IO to an http.Server and wire up all signalling handlers.
 * Event names and payloads are kept byte-for-byte compatible with the v1
 * client so existing voice calls and the WebRTC handshake keep working.
 */
function init(server) {
  io = new Server(server, {
    cors: { origin: config.corsOrigin },
    transports: ['websocket', 'polling'], // allow both for Vercel/Render compat
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ----- Prepare authenticated socket connections (Sprint 1A: permissive) ----
  // A client may pass a JWT via handshake.auth.token or Authorization header.
  // If valid, we attach socket.user. If absent/invalid we STILL allow the
  // connection so the legacy username-only client keeps working. Hardening to
  // *require* a token is a one-line change documented in docs/SPRINT-1A.md.
  io.use((socket, next) => {
    const token = (socket.handshake.auth && socket.handshake.auth.token)
      || bearerFrom(socket.handshake.headers && socket.handshake.headers.authorization);
    if (token) {
      try {
        const payload = authService.verifyToken(token);
        socket.user = { id: payload.sub, username: payload.username };
        log.debug('socket authenticated', { socketId: socket.id, username: payload.username });
      } catch (err) {
        log.warn('invalid socket token, continuing anonymously', {
          socketId: socket.id,
          error: err.message,
        });
      }
    }
    // Sprint 1B: optionally require a valid token to connect.
    if (config.socketAuthRequired && !socket.user) {
      return next(new Error('Authentication required'));
    }
    next();
  });

  io.on('connection', (socket) => {
    log.info('socket connected', { socketId: socket.id, authenticated: !!socket.user });

    // ---------------------------------------------------------------- presence
    socket.on('user:join', ({ username } = {}) => {
      username = String(username || '').trim().toLowerCase();
      if (!username) return;

      presence.add(socket.id, {
        id: socket.id,
        username,
        online: true,
        lastSeen: Date.now(),
        joinedAt: Date.now(),
      });
      presence.setSocketFor(username, socket.id);
      socket.username = username;

      log.info('user joined', { username, socketId: socket.id });
      io.emit('users:update', presence.list());
      socket.emit('user:joined', { username, id: socket.id });

      // Sprint 1B: mirror online status to the account record when DB is on.
      if (config.supabase.enabled) {
        userService
          .updateStatus(username, { online: true })
          .catch((e) => log.warn('presence persist failed', { username, error: e.message }));
      }
    });

    // -------------------------------------------------------------- call: signal
    socket.on('call:initiate', ({ to, from }) => {
      const toSocketId = presence.getSocketId(to);
      const caller = presence.getBySocket(socket.id);
      if (!toSocketId) {
        socket.emit('call:failed', { reason: 'User offline', to });
        socket.emit('call:go-voicemail', { to, from, reason: 'offline' });
        return;
      }
      if (!caller) return;

      const callId = uuidv4();
      log.info('call initiated', { callId, from, to });

      io.to(toSocketId).emit('call:incoming', {
        callId,
        from,
        fromSocket: socket.id,
        to,
        timestamp: Date.now(),
      });
      socket.emit('call:outgoing', { callId, to, from });

      callService.record({ id: callId, from, to, status: 'initiated', timestamp: Date.now(), duration: 0 });
    });

    socket.on('call:accept', ({ callId, to, from }) => {
      const callerSocketId = presence.getSocketId(from);
      if (callerSocketId) io.to(callerSocketId).emit('call:accepted', { callId, by: to });
      callService.updateById(callId, { status: 'ongoing' });
    });

    socket.on('call:reject', ({ callId, to, from, sendToVoicemail }) => {
      const callerSocketId = presence.getSocketId(from);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:rejected', {
          callId,
          by: to,
          goVoicemail: !!sendToVoicemail,
        });
        if (sendToVoicemail) {
          io.to(callerSocketId).emit('call:go-voicemail', { to, from, reason: 'declined' });
        }
      }
      callService.updateById(callId, {
        status: sendToVoicemail ? 'voicemail_pending' : 'rejected',
      });
      if (!sendToVoicemail) {
        callService.record({ from, to, status: 'missed', timestamp: Date.now(), duration: 0 });
      }
    });

    socket.on('call:end', async ({ callId, from, to, duration }) => {
      try {
        const otherUsername = socket.username === from ? to : from;
        const otherSocketId = presence.getSocketId(otherUsername);
        if (otherSocketId) {
          io.to(otherSocketId).emit('call:ended', { callId, by: socket.username, duration });
        }
        const existing = await callService.findById(callId);
        if (existing) {
          await callService.updateById(callId, {
            status: 'ended',
            duration: duration || 0,
            endedAt: Date.now(),
          });
        } else {
          await callService.record({
            id: callId || uuidv4(),
            from,
            to,
            status: 'ended',
            timestamp: Date.now(),
            duration: duration || 0,
          });
        }
      } catch (err) {
        log.error('call:end failed', { callId, error: err.message });
      }
    });

    socket.on('call:missed-timeout', ({ callId, from, to }) => {
      const callerSocketId = presence.getSocketId(from);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:go-voicemail', { to, from, callId, reason: 'timeout' });
      }
      callService.updateById(callId, { status: 'missed_timeout' });
      callService.record({ from, to, status: 'missed', timestamp: Date.now(), duration: 0 });
    });

    // ------------------------------------------------------------- WebRTC relay
    socket.on('webrtc:offer', ({ to, offer, callId }) => {
      const toSocketId = presence.getSocketId(to);
      if (toSocketId) io.to(toSocketId).emit('webrtc:offer', { from: socket.username, offer, callId });
    });

    socket.on('webrtc:answer', ({ to, answer, callId }) => {
      const toSocketId = presence.getSocketId(to);
      if (toSocketId) io.to(toSocketId).emit('webrtc:answer', { from: socket.username, answer, callId });
    });

    socket.on('webrtc:ice-candidate', ({ to, candidate, callId }) => {
      const toSocketId = presence.getSocketId(to);
      if (toSocketId) io.to(toSocketId).emit('webrtc:ice-candidate', { from: socket.username, candidate, callId });
    });

    // ---------------------------------------------------------------- disconnect
    socket.on('disconnect', () => {
      const user = presence.remove(socket.id);
      if (user) {
        log.info('user disconnected', { username: user.username, socketId: socket.id });
        io.emit('users:update', presence.list());

        // Sprint 1B: mark the account offline when DB is on.
        if (config.supabase.enabled) {
          userService
            .updateStatus(user.username, { online: false })
            .catch((e) => log.warn('presence persist failed', { username: user.username, error: e.message }));
        }
      }
    });
  });

  log.info('socket.io initialised', { transports: ['websocket', 'polling'], cors: config.corsOrigin });
  return io;
}

/** Deliver an event to a currently-online user by username. Returns true if delivered. */
function notifyUser(username, event, payload) {
  if (!io) return false;
  const socketId = presence.getSocketId(username);
  if (!socketId) return false;
  io.to(socketId).emit(event, payload);
  return true;
}

function getIO() {
  return io;
}

module.exports = {
  init,
  getIO,
  notifyUser,
};
