/**
 * One-time script to create an admin user in Supabase.
 * Run: node createAdmin.js
 *
 * After running, use these credentials to log in at /client/login.html
 */

require('dotenv').config();
const bcrypt   = require('bcryptjs');
const supabase = require('./lib/supabase');

async function main() {
  console.log('🔌 Connecting to Supabase...');

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', 'admin@pilateszone.com')
    .maybeSingle();

  if (existing) {
    console.log('ℹ️  Admin user already exists. Email: admin@pilateszone.com');
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash('admin@123', 12);

  const { error } = await supabase
    .from('profiles')
    .insert({
      name:               'Admin',
      email:              'admin@pilateszone.com',
      phone:              '+91 98000 00000',
      password:           hashedPassword,
      role:               'admin',
      status:             'verified',
      is_email_verified:  true,
      sessions_remaining: 0,
      total_spent:        0,
    });

  if (error) {
    console.error('❌ Failed to create admin:', error.message);
    process.exit(1);
  }

  console.log('✅ Admin user created!');
  console.log('   Email:    admin@pilateszone.com');
  console.log('   Password: admin@123');
  console.log('   ⚠️  Change the password after first login!');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
