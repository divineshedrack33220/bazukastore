const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const mongoose = require('mongoose');
const Store = require('../models/Store');
const Product = require('../models/Product');
const User = require('../models/User');

// === PUBLIC ROUTES ===
router.get('/', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    console.log('[STORE ROUTES] Fetching top stores, limit:', limit);

    const stores = await Store.aggregate([
      {
        $match: {
          shopName: { $exists: true, $ne: null, $ne: '' }
        }
      },
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

    console.log('[STORE ROUTES] Fetched', stores.length, 'stores');
    res.json(stores);
  } catch (error) {
    console.error('[STORE ROUTES] getStores error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// === AUTHENTICATED ROUTES ===
router.get('/my-store', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const store = await Store.findOne({ user: userId }).lean();
    if (!store) return res.status(404).json({ message: 'No store found' });
    res.json(store);
  } catch (error) {
    console.error('[STORE ROUTES] getMyStore error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/my-store', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { shopName } = req.body;
    let store = await Store.findOne({ user: userId });
    if (store) {
      store.shopName = shopName;
    } else {
      store = new Store({ user: userId, shopName });
    }
    await store.save();
    await User.findByIdAndUpdate(userId, { shopName, isSeller: true });
    res.json(store);
  } catch (error) {
    console.error('[STORE ROUTES] createMyStore error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/my-products', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const products = await Product.find({ user: userId })
      .populate('user', 'name shopName')
      .sort({ createdAt: -1 })
      .lean();
    res.json(products);
  } catch (error) {
    console.error('[STORE ROUTES] getMyProducts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/products', auth, upload.array('images', 5), async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('[STORE ROUTES] Creating product for user:', userId);

    let store = await Store.findOne({ user: userId });
    if (!store) {
      const defaultShopName = req.body.shopName || `${req.user.name}'s Store`;
      store = new Store({ user: userId, shopName: defaultShopName });
      await store.save();
      await User.findByIdAndUpdate(userId, { shopName: defaultShopName, isSeller: true });
      console.log('[STORE ROUTES] Auto-created store:', store._id);
    }

    const { name, description, price, dealPrice, stock, category } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: 'Product name is required' });
    if (!price || parseFloat(price) <= 0) return res.status(400).json({ message: 'Valid price is required' });
    if (!stock || parseInt(stock) < 0) return res.status(400).json({ message: 'Valid stock is required' });
    if (!category || !mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: 'Valid category is required' });
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
      images: req.files ? req.files.map(file => ({ url: file.path })) : []
    });

    await product.save();
    await product.populate('user store', 'name shopName');

    console.log('[STORE ROUTES] Product created:', product._id);
    res.status(201).json(product);
  } catch (error) {
    console.error('[STORE ROUTES] createStoreProduct error:', error);
    if (error.name === 'ValidationError') {
      const msg = Object.values(error.errors)[0]?.message || 'Validation failed';
      return res.status(400).json({ message: msg });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/products/:id', auth, upload.array('images', 5), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const product = await Product.findOne({ _id: id, user: userId });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const { name, description, price, dealPrice, stock, category } = req.body;

    if (name?.trim()) product.name = name.trim();
    if (description !== undefined) product.description = description.trim();
    if (price) product.price = parseFloat(price);
    if (dealPrice) product.dealPrice = parseFloat(dealPrice);
    if (stock) product.stock = parseInt(stock);
    if (category && mongoose.Types.ObjectId.isValid(category)) product.category = category;

    if (req.files) product.images = req.files.map(file => ({ url: file.path }));

    await product.save();
    await product.populate('user store', 'name shopName');

    res.json(product);
  } catch (error) {
    console.error('[STORE ROUTES] updateStoreProduct error:', error);
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