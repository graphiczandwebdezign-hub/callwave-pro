// Vercel serverless entry - wraps the main server
// Vercel will use this file for all routes if vercel.json routes to it

const app = require('../server.js').app;
const { server, io } = require('../server.js');

// For Vercel, we need to handle the server as a function
// Socket.IO on Vercel works with WebSockets but serverless has limitations
// This export makes Express work, Socket.IO will try to work via polling initially

module.exports = (req, res) => {
  // Let the main server handle it - in Vercel's case, app already has static etc
  return app(req, res);
};

// Also export for Socket.IO - Vercel will keep this warm for WS
module.exports = app;
