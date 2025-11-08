// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: String,
  address: String,
  avatar: String,
  isAdmin: { type: Boolean, default: false },
  is2FAEnabled: { type: Boolean, default: false },
  isSuspended: { type: Boolean, default: false },
  isApprovedSeller: { type: Boolean, default: false },
  isSeller: { type: Boolean, default: false },
  shopName: String,
}, { timestamps: true });

// Hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);