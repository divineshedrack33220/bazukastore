const express = require('express');
const router = express.Router(); // ← FIXED: was `express = express.Router()`
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const Store = require('../models/Store');
const Product = require('../models/Product');
const User = require('../models/User');

// === PUBLIC ROUTES ===
router.get('/', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const stores = await Store.aggregate([
      { $match: { shopName: { $exists: true, $ne: null, $ne: '' } } },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'store',
          as: 'products'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userData'
        }
      },
      {
        $addFields: {
          productCount: { $size: '$products' },
          avgRating: {
            $cond: {
              if: { $gt: [{ $size: '$products' }, 0] },
              then: { $avg: '$products.rating' },
              else: 0
            }
          },
          user: {
            _id: { $arrayElemAt: ['$userData._id', 0] },
            name: { $arrayElemAt: ['$userData.name', 0] },
            shopName: '$shopName',
            avatar: { $ifNull: [ { $arrayElemAt: ['$userData.avatar', 0] }, null ] }
          }
        }
      },
      { $unset: ['products', 'userData'] },
      { $sort: { avgRating: -1, productCount: -1 } },
      { $limit: parseInt(limit) }
    ]);

    res.json(stores);
  } catch (error) {
    console.error('[STORE ROUTES] getStores error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// === AUTHENTICATED ROUTES ===
router.get('/my-store', auth, async (req, res) => {
  try {
    const store = await Store.findOne({ user: req.user.id }).lean();
    if (!store) return res.status(404).json({ message: 'No store found' });
    res.json(store);
  } catch (error) {
    console.error('[STORE ROUTES] getMyStore error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/my-store', auth, async (req, res) => {
  try {
    const { shopName } = req.body;
    let store = await Store.findOne({ user: req.user.id });
    if (store) {
      store.shopName = shopName;
    } else {
      store = new Store({ user: req.user.id, shopName });
    }
    await store.save();
    await User.findByIdAndUpdate(req.user.id, { shopName, isSeller: true });
    res.json(store);
  } catch (error) {
    console.error('[STORE ROUTES] createMyStore error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/my-products', auth, async (req, res) => {
  try {
    const products = await Product.find({ user: req.user.id })
      .populate('user', 'name shopName')
      .sort({ createdAt: -1 })
      .lean();
    res.json(products);
  } catch (error) {
    console.error('[STORE ROUTES] getMyProducts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// === PRODUCT ROUTES (NO MULTER – CLIENT UPLOADS TO CLOUDINARY) ===
router.post('/products', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    let store = await Store.findOne({ user: userId });
    if (!store) {
      const defaultShopName = req.body.shopName || `${req.user.name}'s Store`;
      store = new Store({ user: userId, shopName: defaultShopName });
      await store.save();
      await User.findByIdAndUpdate(userId, { shopName: defaultShopName, isSeller: true });
    }

    const { name, description, price, dealPrice, stock, category, images } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: 'Product name is required' });
    if (!price || parseFloat(price) <= 0) return res.status(400).json({ message: 'Valid price is required' });
    if (!stock || parseInt(stock) < 0) return res.status(400).json({ message: 'Valid stock is required' });
    if (!category || !mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: 'Valid category is required' });
    }
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: 'At least one image URL is required' });
    }

    const product = new Product({
      name: name.trim(),
      description: description?.trim() || '',
      price: parseFloat(price),
      dealPrice: dealPrice ? parseFloat(dealPrice) : undefined,
      stock: parseInt(stock),
      category,
      user: userId,
      store: store._id,
      images: images.map(url => ({ url }))
    });

    await product.save();
    await product.populate('user store', 'name shopName');
    res.status(201).json(product);
  } catch (error) {
    console.error('[STORE ROUTES] createProduct error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/products/:id', auth, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, user: req.user.id });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const { name, description, price, dealPrice, stock, category, images } = req.body;

    if (name?.trim()) product.name = name.trim();
    if (description !== undefined) product.description = description.trim();
    if (price) product.price = parseFloat(price);
    if (dealPrice) product.dealPrice = parseFloat(dealPrice);
    if (stock) product.stock = parseInt(stock);
    if (category && mongoose.Types.ObjectId.isValid(category)) product.category = category;
    if (Array.isArray(images)) product.images = images.map(url => ({ url }));

    await product.save();
    await product.populate('user store', 'name shopName');
    res.json(product);
  } catch (error) {
    console.error('[STORE ROUTES] updateProduct error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const store = await Store.findById(req.params.id)
      .populate('user', 'name shopName avatar phone')
      .lean();
    if (!store) return res.status(404).json({ message: 'Store not found' });
    res.json(store);
  } catch (err) {
    console.error('[STORE ROUTES] Error fetching store:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
