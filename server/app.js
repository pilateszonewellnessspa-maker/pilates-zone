/**
 * Express App — exported for both local server and Vercel serverless
 */

require('dotenv').config({ path: __dirname + '/.env' });
const express  = require('express');
const cors     = require('cors');
const path     = require('path');

const app = express();

// ─── CORS ─────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:5001',
      'http://127.0.0.1:5001',
      'null', // file:// access during development
    ];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Serve static files (local dev — Vercel serves these via CDN) ────────────
app.use(express.static(path.join(__dirname, '..')));          // serves root index.html
app.use('/client', express.static(path.join(__dirname, '../client')));  // serves client/*

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/user',     require('./routes/user'));

// ─── Health check ─────────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', message: 'Pilates Zone API running' })
);

module.exports = app;
