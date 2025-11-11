// models/StoreProduct.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const storeProductSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  store: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: String,
  description: String,
  price: Number,
  dealPrice: Number,
  originalPrice: Number,
  discount: Number,
  stock: Number,
  images: [{ url: String, public_id: String }],
  rating: Number,
  reviewCount: Number,
  category: { type: Schema.Types.ObjectId, ref: 'Category' },
  isFlashDeal: Boolean,
  isBestSeller: Boolean,
  isUnder5k: Boolean,
  isUnder10k: Boolean,
  shopName: String,
  shopAvatar: String,
}, { timestamps: true });

module.exports = mongoose.model('StoreProduct', storeProductSchema);