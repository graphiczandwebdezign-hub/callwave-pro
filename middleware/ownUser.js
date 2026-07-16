const userService = require('../services/userService');

/**
 * Per-user authorization for `:username` route params.
 *
 * Behaviour:
 *   - Authenticated request (req.user set): the requested username MUST match
 *     the authenticated user, otherwise 403. This enforces that a user can only
 *     read their own voicemails / call history.
 *   - Unauthenticated request (legacy / optionalAuth passed through): allowed.
 *     Keeps the old username-only clients working during the rollout.
 *
 * Apply to routes like GET /api/voicemails/:username and /api/history/:username.
 */
// eslint-disable-next-line no-unused-vars
function ownUserOrLegacy(req, res, next) {
  if (req.user) {
    const requested = userService.normalize(req.params.username);
    if (requested !== req.user.username) {
      return res.status(403).json({
        error: 'You can only access your own data',
        code: 'FORBIDDEN',
      });
    }
  }
  next();
}

module.exports = { ownUserOrLegacy };
