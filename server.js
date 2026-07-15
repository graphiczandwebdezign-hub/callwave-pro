/**
 * CallWave Pro v2.0 — application entry point.
 *
 * server.js is now a thin composition layer: it loads config, applies global
 * middleware, mounts the route modules, attaches Socket.IO (via the socket
 * service), and starts listening. All business logic lives in /services,
 * /routes, /middleware and /utils.
 */

require('./config'); // load .env + ensure directories exist (do this first)
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const routes = require('./routes');
const socketService = require('./services/socketService');
const { notFound } = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const log = logger.child({ module: 'server' });
const app = express();
const server = http.createServer(app);

// --------------------------------------------------------------- middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Structured request logging (debug-level, skipped for noisy socket polls).
app.use((req, res, next) => {
  if (!req.path.startsWith('/socket.io')) {
    log.debug('request', { method: req.method, path: req.path });
  }
  next();
});

// Static assets + voicemail uploads
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(config.uploadDir));

// --------------------------------------------------------------- routes
app.use(routes);

// SPA fallback — serve the client for any non-API, non-auth route.
// Registered AFTER the routers so /api/* and /auth/* are matched first.
app.get('*', (req, res, next) => {
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/auth/') ||
    req.path.startsWith('/uploads/') ||
    req.path.startsWith('/socket.io/')
  ) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --------------------------------------------------------------- error handling
app.use(notFound);
app.use(errorHandler);

// --------------------------------------------------------------- realtime
socketService.init(server);

// --------------------------------------------------------------- boot
const PORT = config.port;

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    log.info('CallWave Pro server running', {
      url: `http://localhost:${PORT}`,
      port: PORT,
      platform: config.platform,
      env: config.env,
      features: ['HD Voice', 'Smart Voicemail', 'Auth (Sprint 1A)'],
    });
  });
}

// Exports for Vercel / serverless / tests
module.exports = app;
module.exports.app = app;
module.exports.server = server;
module.exports.io = socketService.getIO();
