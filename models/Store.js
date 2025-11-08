// models/Store.js
const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true, // ← This creates { user: 1 } index automatically
  },
  shopName: {
    type: String,
    required: [true, 'Shop name is required'],
    trim: true,
    minlength: [3, 'Shop name must be at least 3 characters'],
    maxlength: [30, 'Shop name must not exceed 30 characters'],
  },
  banner: { type: String },
  description: { type: String },
  verified: { type: Boolean, default: false },
  rating: { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual: product count
storeSchema.virtual('productCount', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'store',
  count: true,
});

// Virtual: average rating
storeSchema.virtual('avgRating', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'store',
  justOne: false,
});

// ONLY ONE EXTRA INDEX — NO DUPLICATES
storeSchema.index({ createdAt: -1 });

// DO NOT ADD: storeSchema.index({ user: 1 }) → already exists via unique: true

module.exports = mongoose.models.Store || mongoose.model('Store', storeSchema);