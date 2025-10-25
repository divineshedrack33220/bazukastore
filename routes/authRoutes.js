const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const googleAuthController = require('../controllers/googleAuthController');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');  // Use the consistent one

// Log route registration
console.log('✅ Registering auth routes');

// POST /api/auth/signup
router.post('/signup', authController.signup);

// POST /api/auth/login
router.post('/login', authController.login);

// POST /api/auth/google
router.post('/google', googleAuthController.googleAuth);

// GET /api/users/profile (renamed from /me for frontend alignment)
router.get('/users/profile', authMiddleware, async (req, res) => {
    console.log(`[${new Date().toISOString()}] GET /api/users/profile | User ID: ${req.user?.id || 'None'} | Token: ${req.header('Authorization') || 'None'}`);
    try {
        if (!req.user?.id) {
            console.log(`[${new Date().toISOString()}] No user ID in request`);
            return res.status(401).json({ message: 'Invalid or missing authentication token' });
        }
        const user = await User.findById(req.user.id).select('_id name email isAdmin');
        if (!user) {
            console.log(`[${new Date().toISOString()}] User not found for ID: ${req.user.id}`);
            return res.status(404).json({ message: 'User not found' });
        }
        console.log(`[${new Date().toISOString()}] Successfully fetched user: ${user.name}`);
        res.json(user);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching user: ${error.message}`);
        res.status(500).json({ message: 'Server error while fetching user data' });
    }
});

// POST /api/auth/refresh (new - simple refresh using existing JWT logic)
router.post('/auth/refresh', authMiddleware, async (req, res) => {
    console.log(`[${new Date().toISOString()}] POST /api/auth/refresh | User ID: ${req.user?.id || 'None'}`);
    try {
        const token = jwt.sign({ id: req.user.id, isAdmin: req.user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Refresh error: ${error.message}`);
        res.status(401).json({ message: 'Failed to refresh token' });
    }
});

module.exports = router;