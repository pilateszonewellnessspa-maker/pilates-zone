/**
 * Auth Middleware – verifies JWT and attaches user (profile row) to req
 * Replaces the Mongoose User.findById() call with a Supabase select.
 */

const jwt      = require('jsonwebtoken');
const supabase = require('../lib/supabase');

const protect = async (req, res, next) => {
  try {
    // 1. Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    const token = authHeader.split(' ')[1];

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Find user in Supabase profiles table
    const { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', decoded.id)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

// Admin-only guard
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Admin access required.' });
};

// Verified-client guard (or admin)
const verifiedOnly = (req, res, next) => {
  if (req.user.role === 'admin' || req.user.status === 'verified') return next();
  return res.status(403).json({
    success: false,
    message: 'Please contact the studio to activate your membership.',
  });
};

module.exports = { protect, adminOnly, verifiedOnly };
