const config = require('../config');
const logger = require('../utils/logger');

const log = logger.child({ module: 'errorHandler' });

/**
 * Central error handler. Mounted last so it catches anything thrown by routes,
 * services, or middleware. Client-safe messages are returned for 4xx errors;
 * a generic message is used for 5xx to avoid leaking internals.
 */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  let status = err.statusCode || err.status || 500;
  let code = err.code || 'INTERNAL';
  let message = err.message || 'Internal server error';

  // Multer upload errors -> 413
  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    code = 'FILE_TOO_LARGE';
    message = 'Voicemail file too large (max 10MB)';
  }

  if (status >= 500) {
    log.error('unhandled server error', {
      message: err.message,
      code,
      path: req.path,
      method: req.method,
      stack: config.isProd ? undefined : err.stack,
    });
    message = 'Internal server error';
  } else {
    log.warn('request error', { message, code, status, path: req.path });
  }

  res.status(status).json({ error: message, code });
};
