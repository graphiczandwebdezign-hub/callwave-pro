/** 404 handler for unmatched routes. Sits after the API routers and SPA fallback. */
// eslint-disable-next-line no-unused-vars
function notFound(req, res, next) {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', path: req.path });
}

module.exports = { notFound };
