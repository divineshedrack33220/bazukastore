// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  console.log(`[${new Date().toISOString()}] Auth | Path: ${req.path} | Token: ${req.header('Authorization') || 'None'}`);
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      console.log(`[${new Date().toISOString()}] No token provided`);
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('_id name email isAdmin');
    if (!user) {
      console.log(`[${new Date().toISOString()}] User not found for ID: ${decoded.id}`);
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = { id: user._id.toString(), _id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin };
    console.log(`[${new Date().toISOString()}] Auth successful for user: ${user.name}`);
    next();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Auth error: ${error.message}`);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    res.status(401).json({ message: 'Authentication failed' });
  }
};

module.exports = auth;