const router = require('express').Router();
const { protect, adminOnly } = require('../middleware/auth');
const admin = require('../controllers/adminController');

// All admin routes require authentication + admin role
router.use(protect, adminOnly);

router.get('/users',                       admin.getAllUsers);
router.patch('/users/:id/approve',         admin.approveUser);
router.post('/users/:id/assign',           admin.assignPackage);
router.get('/payments',                    admin.getAllPayments);

// QR payment approval
router.patch('/payments/:id/approve',      admin.approvePayment);
router.patch('/payments/:id/reject',       admin.rejectPayment);

// Package management
router.post('/packages',                   admin.createPackage);
router.patch('/packages/:id',              admin.updatePackage);
router.delete('/packages/:id',             admin.deletePackage);

// One-time seed
router.post('/seed-packages',              admin.seedPackages);

module.exports = router;
