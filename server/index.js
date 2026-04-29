/**
 * Local Development Server
 * Validates Supabase connection then starts listening.
 * For Vercel deployment, see /api/index.js
 */

require('dotenv').config();
const app      = require('./app');
const supabase = require('./lib/supabase');

async function startServer() {
  // Ping Supabase to confirm connectivity
  const { error } = await supabase.from('profiles').select('id').limit(1);
  if (error && error.code !== 'PGRST116') {
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
