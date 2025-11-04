// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  console.log(`[${new Date().toISOString()}] AuthMiddleware | Path: ${req.path} | Token: ${req.header('Authorization') || 'None'}`);
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      console.log(`[${new Date().toISOString()}] No Authorization header`);
      return res.status(401).json({ message: 'No Authorization header provided' });
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      console.log(`[${new Date().toISOString()}] No token in header`);
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.id) {
      console.log(`[${new Date().toISOString()}] Invalid token payload`);
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    const user = await User.findById(decoded.id).select('_id name email isAdmin');
    if (!user) {
      console.log(`[${new Date().toISOString()}] User not found for ID: ${decoded.id}`);
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = { id: user._id.toString(), _id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin };
    console.log(`[${new Date().toISOString()}] Auth successful for user: ${user.name}`);
    next();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] AuthMiddleware error: ${error.message}`);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    res.status(401).json({ message: `Authentication failed: ${error.message}` });
  }
};

module.exports = authMiddleware;