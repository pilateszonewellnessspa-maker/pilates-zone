/**
 * Auth Controller
 * Handles signup, login, OTP send/verify, token generation.
 *
 * MongoDB / Mongoose replaced with Supabase.
 * All business logic, response shapes, and OTP flow are identical.
 */

const jwt            = require('jsonwebtoken');
const bcrypt         = require('bcryptjs');
const supabase       = require('../lib/supabase');
const { sendOTPEmail } = require('../utils/email');

// ── Sign JWT ──────────────────────────────────────────────────
const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
});

// ── Shared user payload builder ────────────────────────────────
// Mirrors the exact field names returned by the original Mongoose version
// so the frontend never needs to change.
const userPayload = (user) => ({
  id:                user.id,
  name:              user.name,
  email:             user.email,
  phone:             user.phone,
  role:              user.role,
  status:            user.status,
  isEmailVerified:   user.is_email_verified,
  activePlanName:    user.active_plan_name,
  activePlanExpiry:  user.active_plan_expiry,
  sessionsRemaining: user.sessions_remaining,
  totalSpent:        user.total_spent || 0,
});

// ── Generate 6-digit OTP ──────────────────────────────────────
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ════════════════════════════════════════════════════════════
// SIGNUP
// ════════════════════════════════════════════════════════════
exports.signup = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // Check for existing email
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate OTP
    const otp       = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Insert into Supabase
    const { data: user, error } = await supabase
      .from('profiles')
      .insert({
        name,
        email:              email.toLowerCase(),
        phone,
        password:           hashedPassword,
        role:               'client',
        status:             'not_verified',
        is_email_verified:  false,
        otp,
        otp_expiry:         otpExpiry,
        sessions_remaining: 0,
        total_spent:        0,
      })
      .select()
      .single();

    if (error) throw error;

    // Send OTP email (non-blocking – do not fail signup if email fails)
    try {
      await sendOTPEmail({ to: email, name, otp });
    } catch (emailErr) {
      console.warn('⚠️  OTP email failed (check EMAIL_USER / EMAIL_PASS in .env):', emailErr.message);
    }

    const token = signToken(user.id);

    res.status(201).json({
      success: true,
      message: 'Account created! Please check your email for the OTP to verify your account.',
      token,
      user: userPayload(user),
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ════════════════════════════════════════════════════════════
// SEND OTP  (resend)
// ════════════════════════════════════════════════════════════
exports.sendOTP = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error || !user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (user.is_email_verified) {
      return res.status(400).json({ success: false, message: 'Email already verified.' });
    }

    const otp       = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ otp, otp_expiry: otpExpiry })
      .eq('id', req.user.id);

    if (updateError) throw updateError;

    await sendOTPEmail({ to: user.email, name: user.name, otp });

    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ success: false, message: 'Could not send OTP.' });
  }
};

// ════════════════════════════════════════════════════════════
// VERIFY OTP
// ════════════════════════════════════════════════════════════
exports.verifyOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ success: false, message: 'OTP is required.' });

    const { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error || !user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (user.is_email_verified) {
      return res.status(400).json({ success: false, message: 'Email already verified.' });
    }

    if (!user.otp || !user.otp_expiry) {
      return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
    }

    if (new Date() > new Date(user.otp_expiry)) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (user.otp !== otp.toString().trim()) {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    // Mark verified, clear OTP
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_email_verified: true, otp: null, otp_expiry: null })
      .eq('id', req.user.id);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Email verified successfully! Welcome to Pilates Zone.' });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
  }
};

// ════════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════════
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    // Fetch user including hashed password
    const { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = signToken(user.id);

    res.json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: userPayload(user),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ════════════════════════════════════════════════════════════
// GET CURRENT USER
// ════════════════════════════════════════════════════════════
exports.getMe = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error || !user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.json({ success: true, user: userPayload(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ════════════════════════════════════════════════════════════
// FORGOT PASSWORD — send reset link by email
// POST /api/auth/forgot-password  { email }
// ════════════════════════════════════════════════════════════
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const { data: user, error: userErr } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (userErr) {
      console.error('forgotPassword – profile lookup error:', userErr.message);
      // Columns may not exist yet — give helpful message
      if (userErr.message && userErr.message.includes('reset_token')) {
        return res.status(500).json({
          success: false,
          message: 'Database not ready. Please run password_reset_migration.sql in Supabase first.',
        });
      }
      throw userErr;
    }

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    // Generate a secure token
    const crypto = require('crypto');
    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ reset_token: token, reset_token_expiry: expiry.toISOString() })
      .eq('id', user.id);

    if (updateErr) {
      console.error('forgotPassword – update error:', updateErr.message);
      if (updateErr.message && updateErr.message.includes('reset_token')) {
        return res.status(500).json({
          success: false,
          message: 'Database not ready. Please run password_reset_migration.sql in Supabase first.',
        });
      }
      throw updateErr;
    }

    const CLIENT_URL = process.env.CLIENT_URL || 'http://127.0.0.1:5500/client';
    const resetLink  = `${CLIENT_URL}/reset-password.html?token=${token}`;

    // Try to send email — if email not configured, log the link and still succeed
    try {
      const { sendPasswordResetEmail } = require('../utils/email');
      await sendPasswordResetEmail({ to: user.email, name: user.name, resetLink });
    } catch (emailErr) {
      console.error('❌ Email failed:', emailErr.message);
      console.log('⚠️ Manual reset link:', resetLink);
    }

    res.json({ success: true, message: 'Reset link sent! Check your email inbox.' });
  } catch (err) {
    console.error('forgotPassword error:', err.message);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
};

// ════════════════════════════════════════════════════════════
// RESET PASSWORD — set new password using token from email
// POST /api/auth/reset-password  { token, password }
// ════════════════════════════════════════════════════════════
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const { data: user } = await supabase
      .from('profiles')
      .select('id, reset_token, reset_token_expiry')
      .eq('reset_token', token)
      .maybeSingle();

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link.' });
    }
    if (new Date(user.reset_token_expiry) < new Date()) {
      return res.status(400).json({ success: false, message: 'This reset link has expired. Please request a new one.' });
    }

    const hashed = await require('bcryptjs').hash(password, 12);

    await supabase
      .from('profiles')
      .update({ password: hashed, reset_token: null, reset_token_expiry: null })
      .eq('id', user.id);

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('resetPassword error:', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ════════════════════════════════════════════════════════════
// CHANGE PASSWORD — for logged-in users
// POST /api/auth/change-password  { currentPassword, newPassword }
// ════════════════════════════════════════════════════════════
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both current and new passwords are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const { data: user } = await supabase
      .from('profiles')
      .select('id, password')
      .eq('id', req.user.id)
      .single();

    const match = await require('bcryptjs').compare(currentPassword, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const hashed = await require('bcryptjs').hash(newPassword, 12);
    await supabase
      .from('profiles')
      .update({ password: hashed })
      .eq('id', user.id);

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('changePassword error:', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
