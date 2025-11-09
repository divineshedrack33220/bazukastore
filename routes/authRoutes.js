const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const googleAuthController = require('../controllers/googleAuthController');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');  // Consistent middleware

// ---------------------------------------------------------------------
// LOG ROUTE REGISTRATION
// ---------------------------------------------------------------------
console.log('Registering auth routes');

// ---------------------------------------------------------------------
// PUBLIC ENDPOINTS
// ---------------------------------------------------------------------
router.post('/signup', authController.signup);
router.post('/login',  authController.login);
router.post('/google', googleAuthController.googleAuth);

// ---------------------------------------------------------------------
// PROTECTED ENDPOINTS – DB-OPTIONAL GRACEFUL FALLBACK
// ---------------------------------------------------------------------

// GET /api/auth/me  (frontend still calls /api/auth/me)
router.get('/me', authMiddleware, async (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /api/auth/me | User ID: ${req.user?.id || 'None'}`);

  try {
    // DB might be down → User model undefined
    if (!User) {
      console.warn('[AUTH] DB down – returning guest profile');
      return res.json({ _id: null, name: 'Guest', isGuest: true });
    }

    const user = await User.findById(req.user.id).select('_id name email isAdmin');
    if (!user) {
      console.log('[AUTH] User not found');
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('[AUTH] Profile fetched');
    res.json(user);
  } catch (err) {
    console.error('[AUTH] /me error:', err.message);
    // Graceful guest fallback
    res.json({ _id: null, name: 'Guest', isGuest: true });
  }
});

// GET /api/users/profile – keep your renamed route (optional)
router.get('/users/profile', authMiddleware, async (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /api/users/profile | User ID: ${req.user?.id || 'None'}`);

  try {
    if (!User) {
      return res.json({ _id: null, name: 'Guest', isGuest: true });
    }

    const user = await User.findById(req.user.id).select('_id name email isAdmin');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (err) {
    console.error('[AUTH] /users/profile error:', err.message);
    res.json({ _id: null, name: 'Guest', isGuest: true });
  }
});

// POST /api/auth/refresh – token refresh (no DB needed)
router.post('/refresh', authMiddleware, async (req, res) => {
  console.log(`[${new Date().toISOString()}] POST /api/auth/refresh | User ID: ${req.user?.id || 'None'}`);

  try {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: req.user.id, isAdmin: req.user.isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    res.json({ token });
  } catch (err) {
    console.error('[AUTH] Refresh error:', err.message);
    res.status(401).json({ message: 'Failed to refresh token' });
  }
});

module.exports = router;