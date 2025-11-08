// models/Product.js
const mongoose = require('mongoose');
const StoreProduct = require('./StoreProduct');

const { Schema } = mongoose;

/* -------------------------------------------------
   1. SCHEMA DEFINITION
   ------------------------------------------------- */
const productSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price cannot be negative'],
    },
    dealPrice: {
      type: Number,
      min: [0, 'Deal price cannot be negative'],
    },
    originalPrice: {
      type: Number,
      min: [0, 'Original price cannot be negative'],
    },
    discount: {
      type: Number,
      min: [0, 'Discount cannot be negative'],
      max: [100, 'Discount cannot exceed 100%'],
    },
    images: [
      {
        url: String,
        public_id: String,
      },
    ],
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Product category is required'],
    },
    stock: {
      type: Number,
      required: [true, 'Product stock is required'],
      min: [0, 'Stock cannot be negative'],
    },
    specifications: {
      type: Map,
      of: String,
    },
    reviews: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        rating: { type: Number, min: 1, max: 5 },
        comment: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    isFlashDeal: {
      type: Boolean,
      default: false,
    },
    isBestSeller: {
      type: Boolean,
      default: false,
    },
    isUnder5k: {
      type: Boolean,
      default: false,
    },
    isUnder10k: {
      type: Boolean,
      default: false,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    store: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

/* -------------------------------------------------
   2. MODEL CREATION
   ------------------------------------------------- */
const Product = mongoose.model('Product', productSchema);

/* -------------------------------------------------
   3. HELPER FUNCTIONS
   ------------------------------------------------- */
const calculateFlags = (price, dealPrice) => {
  const final = dealPrice ?? price;
  return {
    isUnder5k: final < 5000,
    isUnder10k: final < 10000,
  };
};

const syncToStoreProduct = async function (productDoc) {
  // Find the store that belongs to the product owner
  const store = await mongoose.model('Store').findOne({ user: productDoc.user });
  if (!store) return;

  const discount =
    productDoc.dealPrice && productDoc.price
      ? Math.round(((productDoc.price - productDoc.dealPrice) / productDoc.price) * 100)
      : 0;

  const { isUnder5k, isUnder10k } = calculateFlags(productDoc.price, productDoc.dealPrice);

  const user = await mongoose.model('User').findById(productDoc.user).select('avatar');

  const storeProductData = {
    productId: productDoc._id,
    store: store._id,
    user: productDoc.user,
    name: productDoc.name,
    description: productDoc.description,
    price: productDoc.price,
    dealPrice: productDoc.dealPrice,
    originalPrice: productDoc.price,
    discount,
    stock: productDoc.stock,
    images: productDoc.images,
    rating: productDoc.rating || 0,
    reviewCount: (productDoc.reviews || []).length,
    category: productDoc.category,
    isFlashDeal: productDoc.isFlashDeal ?? false,
    isBestSeller: productDoc.isBestSeller ?? false,
    isUnder5k,
    isUnder10k,
    shopName: store.shopName,
    shopAvatar: user?.avatar ?? null,
  };

  await StoreProduct.findOneAndUpdate(
    { productId: productDoc._id },
    storeProductData,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

/* -------------------------------------------------
   4. POST‑SAVE & POST‑UPDATE HOOKS
   ------------------------------------------------- */
productSchema.post('save', async function (doc) {
  try {
    await syncToStoreProduct(doc);
  } catch (err) {
    console.error('Product post‑save hook error:', err);
  }
});

productSchema.post('findOneAndUpdate', async function (doc) {
  if (doc) {
    try {
      await syncToStoreProduct(doc);
    } catch (err) {
      console.error('Product post‑findOneAndUpdate hook error:', err);
    }
  }
});

/* -------------------------------------------------
   5. EXPORT
   ------------------------------------------------- */
module.exports = Product;