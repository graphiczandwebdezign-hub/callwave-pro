/**
 * Operational error with an HTTP status code and machine-readable code.
 * Thrown by services/routes for expected, safe-to-expose failures so the
 * central error handler can format a clean JSON response without leaking
 * internal details.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
