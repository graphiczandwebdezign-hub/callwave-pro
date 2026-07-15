// Vercel serverless entry — delegates to the Express app exported by server.js.
// Socket.IO over Vercel serverless has the usual caveats (see DEPLOYMENT.md);
// for production voice calls prefer a persistent host (Render / Fly / Railway).

const { app } = require('../server.js');

module.exports = (req, res) => app(req, res);
module.exports.app = app;
