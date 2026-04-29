/**
 * Admin Controller
 * User management + manual package assignment
 *
 * MongoDB / Mongoose replaced with Supabase.
 * All response shapes are IDENTICAL to the original.
 */

const bcrypt   = require('bcryptjs');
const supabase = require('../lib/supabase');

// ── List all users ─────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, name, email, phone, role, status, active_plan_name, active_plan_expiry, sessions_remaining, created_at')
      .eq('role', 'client')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Map snake_case → camelCase to match original frontend expectations
    const mapped = users.map(u => ({
      _id:               u.id,
      id:                u.id,
      name:              u.name,
      email:             u.email,
      phone:             u.phone,
      role:              u.role,
      status:            u.status,
      activePlanName:    u.active_plan_name,
      activePlanExpiry:  u.active_plan_expiry,
      sessionsRemaining: u.sessions_remaining,
      createdAt:         u.created_at,
    }));

    res.json({ success: true, count: mapped.length, users: mapped });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── Approve user (toggle verified) ────────────────────────────
exports.approveUser = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('profiles')
      .select('id, status')
      .eq('id', req.params.id)
      .single();

    if (error || !user) return res.status(404).json({ success: false, message: 'User not found.' });

    const newStatus = user.status === 'verified' ? 'not_verified' : 'verified';

    const { data: updated, error: updateErr } = await supabase
      .from('profiles')
      .update({ status: newStatus })
      .eq('id', req.params.id)
      .select('id, name, email, status')
      .single();

    if (updateErr) throw updateErr;

    res.json({ success: true, message: `User status set to "${newStatus}".`, user: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── Manually assign package to user ───────────────────────────
exports.assignPackage = async (req, res) => {
  try {
    const { packageId } = req.body;

    const { data: user, error: userErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.params.id)
      .single();

    const { data: pkg, error: pkgErr } = await supabase
      .from('packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (userErr || !user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (pkgErr  || !pkg)  return res.status(404).json({ success: false, message: 'Package not found.' });

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + pkg.validity_days);

    // Update user membership
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({
        status:             'verified',
        active_plan_id:     pkg.id,
        active_plan_name:   pkg.name,
        active_plan_expiry: expiry.toISOString(),
        sessions_remaining: pkg.sessions || 0,
      })
      .eq('id', req.params.id);

    if (profileErr) throw profileErr;

    // Record a manual payment entry
    const invoiceNumber = `PZ-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    const { error: payErr } = await supabase
      .from('payments')
      .insert({
        user_id:        req.params.id,
        package_id:     pkg.id,
        package_name:   pkg.name,
        amount:         pkg.price,
        status:         'manual',
        invoice_number: invoiceNumber,
      });

    if (payErr) throw payErr;

    res.json({ success: true, message: 'Package assigned successfully.', user: { ...user, status: 'verified' } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── All payments ───────────────────────────────────────────────
exports.getAllPayments = async (req, res) => {
  try {
    const { data: payments, error } = await supabase
      .from('payments')
      .select(`
        *,
        profiles!user_id ( name, email, phone ),
        packages!package_id ( name, price )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('getAllPayments Supabase error:', error.message, error.details, error.hint);
      throw error;
    }

    // Normalise to match original Mongoose populate shape
    const normalised = payments.map(p => ({
      ...p,
      invoiceNumber: p.invoice_number,
      packageName:   p.package_name,
      user:          p['profiles!user_id'] || p.profiles,
      package:       p['packages!package_id'] || p.packages,
      'profiles!user_id': undefined,
      'packages!package_id': undefined,
      profiles:      undefined,
      packages:      undefined,
    }));

    res.json({ success: true, count: normalised.length, payments: normalised });
  } catch (err) {
    console.error('getAllPayments error:', err.message);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
};

// ── Package CRUD ───────────────────────────────────────────────
exports.createPackage = async (req, res) => {
  try {
    const { name, price, description, validityDays, sessions, icon, highlight } = req.body;

    const { data: pkg, error } = await supabase
      .from('packages')
      .insert({
        name,
        price:        Number(price),
        description,
        validity_days: Number(validityDays),
        sessions:     Number(sessions) || 0,
        icon:         icon || '✦',
        highlight:    highlight || false,
        is_active:    true,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, package: normalisePkg(pkg) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updatePackage = async (req, res) => {
  try {
    const updates = {};
    if (req.body.name         !== undefined) updates.name          = req.body.name;
    if (req.body.price        !== undefined) updates.price         = Number(req.body.price);
    if (req.body.description  !== undefined) updates.description   = req.body.description;
    if (req.body.validityDays !== undefined) updates.validity_days = Number(req.body.validityDays);
    if (req.body.sessions     !== undefined) updates.sessions      = Number(req.body.sessions);
    if (req.body.icon         !== undefined) updates.icon          = req.body.icon;
    if (req.body.highlight    !== undefined) updates.highlight     = req.body.highlight;
    if (req.body.isActive     !== undefined) updates.is_active     = req.body.isActive;

    const { data: pkg, error } = await supabase
      .from('packages')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found.' });

    res.json({ success: true, package: normalisePkg(pkg) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deletePackage = async (req, res) => {
  try {
    const { error } = await supabase
      .from('packages')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true, message: 'Package deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── Seed default packages ──────────────────────────────────────
exports.seedPackages = async (req, res) => {
  try {
    const { count, error: countErr } = await supabase
      .from('packages')
      .select('*', { count: 'exact', head: true });

    if (countErr) throw countErr;
    if (count > 0) return res.json({ success: true, message: 'Packages already seeded.' });

    const defaults = [
      {
        name:          'Monthly Unlimited',
        price:         3999,
        description:   'Unlimited Pilates + Spa sessions for 30 days. Perfect for consistent practitioners.',
        validity_days: 30,
        sessions:      0,
        icon:          '✦',
        highlight:     false,
        is_active:     true,
      },
      {
        name:          '12 Sessions Pack',
        price:         5999,
        description:   '12 premium sessions valid for 90 days. Great value for flexible schedules.',
        validity_days: 90,
        sessions:      12,
        icon:          '⚡',
        highlight:     true,
        is_active:     true,
      },
      {
        name:          'Personal Training',
        price:         8999,
        description:   '8 one-on-one personal training sessions with certified trainers. Tailored to your goals.',
        validity_days: 60,
        sessions:      8,
        icon:          '◎',
        highlight:     false,
        is_active:     true,
      },
    ];

    const { error } = await supabase.from('packages').insert(defaults);
    if (error) throw error;

    res.json({ success: true, message: 'Default packages seeded.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Seeding failed.' });
  }
};

// ── Helper: normalise package row → frontend camelCase shape ───
function normalisePkg(p) {
  return {
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
  };
}

// ── Approve pending QR payment ──────────────────────────────────
// PATCH /api/admin/payments/:id/approve
exports.approvePayment = async (req, res) => {
  try {
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .select('*, packages!package_id ( * )')
      .eq('id', req.params.id)
      .single();

    if (payErr || !payment)
      return res.status(404).json({ success: false, message: 'Payment not found.' });
    if (payment.status !== 'pending')
      return res.status(409).json({ success: false, message: `Payment is already ${payment.status}.` });

    const pkg = payment['packages!package_id'] || payment.packages;
    if (!pkg)
      return res.status(400).json({ success: false, message: 'Associated package not found.' });

    const now    = new Date();
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + pkg.validity_days);

    const { error: updatePayErr } = await supabase
      .from('payments')
      .update({ status: 'approved', reviewed_at: now.toISOString(), reviewed_by: req.user.id })
      .eq('id', req.params.id);
    if (updatePayErr) throw updatePayErr;

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({
        status:             'verified',
        active_plan_id:     pkg.id,
        active_plan_name:   pkg.name,
        active_plan_expiry: expiry.toISOString(),
        sessions_remaining: pkg.sessions || 0,
      })
      .eq('id', payment.user_id);
    if (profileErr) throw profileErr;

    const invoiceNum = payment.invoice_number ||
      `PZ-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    // Fetch user for receipt snapshot
    const { data: receiptUser } = await supabase
      .from('profiles')
      .select('name, email, phone')
      .eq('id', payment.user_id)
      .single();

    const { error: receiptErr } = await supabase
      .from('receipts')
      .insert({
        payment_id:     payment.id,
        user_id:        payment.user_id,
        package_id:     pkg.id,
        package_name:   pkg.name,
        name:           receiptUser?.name || '',
        email:          receiptUser?.email || '',
        phone:          receiptUser?.phone || '',
        plan_name:      pkg.name,
        amount:         pkg.price,
        status:         'paid',
        transaction_id: payment.razorpay_order_id || payment.id,
        invoice_number: invoiceNum,
        valid_until:    expiry.toISOString(),
        issued_at:      now.toISOString(),
      });
    if (receiptErr) throw receiptErr;

    res.json({ success: true, message: 'Payment approved. Subscription activated and receipt created.' });
  } catch (err) {
    console.error('approvePayment error:', err.message);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
};

// ── Reject pending QR payment ──────────────────────────────────
// PATCH /api/admin/payments/:id/reject
exports.rejectPayment = async (req, res) => {
  try {
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .select('id, status')
      .eq('id', req.params.id)
      .single();

    if (payErr || !payment)
      return res.status(404).json({ success: false, message: 'Payment not found.' });
    if (payment.status !== 'pending')
      return res.status(409).json({ success: false, message: `Payment is already ${payment.status}.` });

    const { error: updateErr } = await supabase
      .from('payments')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: req.user.id })
      .eq('id', req.params.id);
    if (updateErr) throw updateErr;

    res.json({ success: true, message: 'Payment rejected.' });
  } catch (err) {
    console.error('rejectPayment error:', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
