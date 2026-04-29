const router = require('express').Router();
const {
  signup, login, getMe, sendOTP, verifyOTP,
  forgotPassword, resetPassword, changePassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public
router.post('/signup',           signup);
router.post('/login',            login);
router.post('/forgot-password',  forgotPassword);
router.post('/reset-password',   resetPassword);

// Protected (must be logged in)
router.get('/me',                protect, getMe);
router.post('/send-otp',         protect, sendOTP);
router.post('/verify-otp',       protect, verifyOTP);
router.post('/change-password',  protect, changePassword);

module.exports = router;
