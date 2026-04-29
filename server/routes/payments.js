const router  = require('express').Router();
const { protect } = require('../middleware/auth');
const {
  createPendingPayment, submitTransactionId,
  getHistory, getInvoice,
} = require('../controllers/paymentController');

// QR / UPI payment flow
router.post('/pending',    protect, createPendingPayment);   // step 1: create pending row
router.post('/submit-txn', protect, submitTransactionId);    // step 2: attach transaction ID

// History & invoices
router.get('/history',     protect, getHistory);
router.get('/invoice/:id', protect, getInvoice);

module.exports = router;
