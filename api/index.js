/**
 * Vercel Serverless Entry Point
 */
const app = require('../server/app');

// Add a catch-all to see what paths are actually reaching the Express app
app.use((req, res, next) => {
  console.log(`[Vercel Debug] Unhandled route hit: ${req.method} ${req.url} (Original: ${req.originalUrl})`);
  res.status(404).json({
    success: false,
    message: 'Route not found on Vercel',
    debug: {
      url: req.url,
      originalUrl: req.originalUrl,
      path: req.path
    }
  });
});

module.exports = app;
