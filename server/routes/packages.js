/**
 * Packages route – public endpoint, lists all active packages.
 * Mongoose replaced with direct Supabase query.
 * Route path unchanged: GET /api/packages
 */

const router   = require('express').Router();
const supabase = require('../lib/supabase');

// Public: list all active packages
router.get('/', async (req, res) => {
  try {
    const { data: packages, error } = await supabase
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) throw error;

    // Normalise to camelCase so the frontend works without any changes
    const normalised = packages.map(p => ({
      _id:          p.id,
      id:           p.id,
      name:         p.name,
      price:        p.price,
      description:  p.description,
      validityDays: p.validity_days,
      sessions:     p.sessions,
      icon:         p.icon,
      highlight:    p.highlight,
      isActive:     p.is_active,
      createdAt:    p.created_at,
    }));

    res.json({ success: true, packages: normalised });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
