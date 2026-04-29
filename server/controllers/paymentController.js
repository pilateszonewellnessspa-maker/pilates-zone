/**
 * Payment Controller – QR / UPI + Supabase
 * All payments are QR-based. Admin approves from the admin panel.
 */

const supabase             = require('../lib/supabase');
const { sendReceiptEmail } = require('../utils/email');

// ── Generate invoice number ────────────────────────────────────
const generateInvoiceNumber = () => {
  const ts   = Date.now().toString().slice(-6);
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `PZ-${ts}-${rand}`;
};

// ── QR Flow: Create Pending Payment ───────────────────────────
// POST /api/payments/pending
// Called when user clicks Buy Now on dashboard.
exports.createPendingPayment = async (req, res) => {
  try {
    const { packageId } = req.body;
    if (!packageId)
      return res.status(400).json({ success: false, message: 'packageId is required.' });

    const { data: pkg, error: pkgErr } = await supabase
      .from('packages')
      .select('*')
      .eq('id', packageId)
      .eq('is_active', true)
      .single();

    if (pkgErr || !pkg)
      return res.status(404).json({ success: false, message: 'Package not found.' });

    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        user_id:        req.user.id,
        package_id:     pkg.id,
        package_name:   pkg.name,
        amount:         pkg.price,
        status:         'pending',
        invoice_number: generateInvoiceNumber(),
      })
      .select()
      .single();

    if (payErr) {
      console.error('createPendingPayment – insert error:', payErr.message);
      throw payErr;
    }

    res.json({ success: true, paymentId: payment.id });
  } catch (err) {
    console.error('createPendingPayment – error:', err.message);
    res.status(500).json({ success: false, message: 'Could not create payment.' });
  }
};

// ── QR Flow: Submit Transaction ID ────────────────────────────
// POST /api/payments/submit-txn
// User pays via UPI and submits their UTR / transaction ID.
// Admin then approves from the admin panel.
exports.submitTransactionId = async (req, res) => {
  try {
    const { paymentId, transactionId } = req.body;

    if (!paymentId || !transactionId)
      return res.status(400).json({ success: false, message: 'paymentId and transactionId are required.' });

    const clean = String(transactionId).trim();
    if (clean.length < 4)
      return res.status(400).json({ success: false, message: 'Enter a valid transaction ID (min 4 characters).' });

    // Verify the payment belongs to this user and is still pending
    const { data: existing, error: findErr } = await supabase
      .from('payments')
      .select('id, status, user_id')
      .eq('id', paymentId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (findErr || !existing)
      return res.status(404).json({ success: false, message: 'Payment not found.' });
    if (existing.status !== 'pending')
      return res.status(409).json({ success: false, message: `Payment is already ${existing.status}.` });

    // Check for duplicate transaction ID
    const { data: dup } = await supabase
      .from('payments')
      .select('id')
      .eq('razorpay_order_id', clean)   // column stores UPI txn ID
      .maybeSingle();
    if (dup)
      return res.status(409).json({ success: false, message: 'This transaction ID has already been submitted.' });

    // Save the transaction ID
    const { error: updateErr } = await supabase
      .from('payments')
      .update({ razorpay_order_id: clean })
      .eq('id', paymentId);

    if (updateErr) {
      console.error('submitTransactionId – update error:', updateErr.message);
      throw updateErr;
    }

    res.json({
      success: true,
      message: 'Transaction ID submitted. Our team will verify and activate your plan shortly.',
    });
  } catch (err) {
    console.error('submitTransactionId – error:', err.message);
    res.status(500).json({ success: false, message: 'Could not submit transaction ID.' });
  }
};

// ── Payment History ────────────────────────────────────────────
// GET /api/payments/history
exports.getHistory = async (req, res) => {
  try {
    const { data: payments, error } = await supabase
      .from('payments')
      .select('*, packages ( name, price )')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const normalised = payments.map(p => ({
      ...p,
      package:  p.packages,
      packages: undefined,
    }));

    res.json({ success: true, payments: normalised });
  } catch (err) {
    console.error('getHistory error:', err.message);
    res.status(500).json({ success: false, message: 'Could not fetch payment history.' });
  }
};

// ── Single Invoice ─────────────────────────────────────────────
// GET /api/payments/:id
exports.getInvoice = async (req, res) => {
  try {
    const { data: payment, error } = await supabase
      .from('payments')
      .select('*, packages ( * )')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !payment)
      return res.status(404).json({ success: false, message: 'Invoice not found.' });

    res.json({ success: true, payment: { ...payment, package: payment.packages, packages: undefined } });
  } catch (err) {
    console.error('getInvoice error:', err.message);
    res.status(500).json({ success: false, message: 'Could not fetch invoice.' });
  }
};
