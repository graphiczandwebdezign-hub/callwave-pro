/**
 * Wrap an async route handler so rejected promises are forwarded to Express's
 * error-handling middleware instead of becoming unhandled rejections.
 *
 *   router.get('/x', asyncHandler(async (req, res) => { ... }))
 */
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
