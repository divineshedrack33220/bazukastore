const express = require('express');
const router = express.Router();
const { register, login, getProfile, updateProfile, changePassword, toggle2FA, getAllUsers } = require('../controllers/userController');
const auth = require('../middleware/auth');

// Public auth routes (no auth middleware)
router.post('/register', register);
router.post('/login', login);

// Protected user routes (requires auth middleware)
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);  // Handles name, phone, shopName, avatar updates
router.post('/change-password', auth, changePassword);
router.post('/toggle-2fa', auth, toggle2FA);

// Admin-only route (auth + isAdmin check in controller)
router.get('/', auth, getAllUsers);  // Lists all users—admin access enforced in controller

module.exports = router;