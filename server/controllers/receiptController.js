/**
 * Receipt Controller
 * Handles receipt listing and detail retrieval.
 *
 * MongoDB / Mongoose replaced with Supabase.
 * All response shapes are IDENTICAL to the original.
 */

const supabase = require('../lib/supabase');

// ── All receipts for logged-in user ───────────────────────────
exports.getMyReceipts = async (req, res) => {
  try {
    const { data: receipts, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, receipts: receipts.map(normaliseReceipt) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── Single receipt ─────────────────────────────────────────────
exports.getReceipt = async (req, res) => {
  try {
    const { data: receipt, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !receipt) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }

    res.json({ success: true, receipt: normaliseReceipt(receipt) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── Admin: all receipts ────────────────────────────────────────
exports.getAllReceipts = async (req, res) => {
  try {
    const { data: receipts, error } = await supabase
      .from('receipts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, count: receipts.length, receipts: receipts.map(normaliseReceipt) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── Helper: normalise receipt row → camelCase ─────────────────
function normaliseReceipt(r) {
  return {
    _id:           r.id,
    id:            r.id,
    userId:        r.user_id,
    paymentId:     r.razorpay_payment_id,
    orderId:       r.razorpay_order_id,
    name:          r.name,
    email:         r.email,
    phone:         r.phone,
    planName:      r.plan_name,
    amount:        r.amount,
    status:        r.status,
    invoiceNumber: r.invoice_number,
    createdAt:     r.created_at,
  };
}
