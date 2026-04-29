const router = require('express').Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getMyReceipts, getReceipt, getAllReceipts } = require('../controllers/receiptController');

router.get('/',          protect, getMyReceipts);
router.get('/:id',       protect, getReceipt);
router.get('/admin/all', protect, adminOnly, getAllReceipts);

module.exports = router;
