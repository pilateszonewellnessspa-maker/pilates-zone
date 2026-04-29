/**
 * Pilates Zone – Main Server Entry Point
 * Node.js + Express + Supabase (PostgreSQL)
 *
 * MongoDB / Mongoose has been fully removed.
 * The Supabase connection is validated at startup via a lightweight ping query.
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const supabase = require('./lib/supabase');

const app = express();

// ─── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
    'null', // file:// access during development
  ],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static client files
app.use(express.static(path.join(__dirname, '../client')));

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/user',     require('./routes/user'));

// ─── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'Pilates Zone API running (Supabase)' }));

// ─── Supabase Connection Validation ───────────────────────────
async function startServer() {
  // Ping Supabase with a lightweight query to confirm connectivity
  const { error } = await supabase.from('profiles').select('id').limit(1);
  if (error && error.code !== 'PGRST116') {
    // PGRST116 = "Results contain 0 rows" – that's fine; any other error is not.
    console.error('❌ Supabase connection failed:', error.message);
    process.exit(1);
  }
  console.log('✅ Supabase connected');

  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}

startServer().catch(err => {
  console.error('❌ Startup error:', err.message);
  process.exit(1);
});
