/**
 * User profile route
 * Mongoose replaced with Supabase.
 * Route path unchanged: GET /api/user/profile
 */

const router   = require('express').Router();
const { protect } = require('../middleware/auth');
const supabase = require('../lib/supabase');

// Get current user profile (full dashboard data)
router.get('/profile', protect, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error || !user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.json({
      success: true,
      user: {
        id:                user.id,
        name:              user.name,
        email:             user.email,
        phone:             user.phone,
        role:              user.role,
        status:            user.status,
        isEmailVerified:   user.is_email_verified,   // ← was missing, caused banner to always show
        activePlanName:    user.active_plan_name,
        activePlanExpiry:  user.active_plan_expiry,
        sessionsRemaining: user.sessions_remaining,
        createdAt:         user.created_at,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
