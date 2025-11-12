const Store = require('../models/Store');
const Product = require('../models/Product');
const User = require('../models/User');

// GET /api/stores - Public: Fetch top stores (with limit, matches frontend shape)
exports.getStores = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    console.log('[STORE CONTROLLER] Fetching top stores, limit:', limit);

    const stores = await User.aggregate([
      {
        $match: {
          $or: [
            { shopName: { $exists: true, $ne: null, $ne: '' } },
            { isSeller: { $exists: true, $eq: true } }
          ]
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'user',
          as: 'products'
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
          }
        }
      },
      {
        $addFields: {
          user: {
            _id: '$_id',
            name: '$name',
            shopName: { $ifNull: ['$shopName', '$name'] },
            avatar: { $ifNull: ['$avatar', null] }
          }
        }
      },
      { $unset: ['products'] },
      { $sort: { avgRating: -1, productCount: -1 } },
      { $limit: parseInt(limit) }
    ]);

    console.log('[STORE CONTROLLER] Fetched', stores.length, 'stores');
    res.json(stores);
  } catch (error) {
    console.error('[STORE CONTROLLER] getStores error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/stores/stores - Auth: Create store for user
exports.createStore = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('[STORE CONTROLLER] Creating store for user:', userId);

    let store = await Store.findOne({ user: userId });
    if (store) return res.status(400).json({ message: 'Store already exists' });

    store = new Store({ user: userId, ...req.body });
    await store.save();
    await store.populate('user', 'name shopName avatar');

    console.log('[STORE CONTROLLER] Store created:', store._id);
    res.status(201).json(store);
  } catch (error) {
    console.error('[STORE CONTROLLER] createStore error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/stores/my-stores - Auth: User's stores
exports.getMyStores = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('[STORE CONTROLLER] Fetching stores for user:', userId);

    const stores = await Store.find({ user: userId })
      .populate('user', 'name shopName avatar')
      .lean();
    res.json(stores);
  } catch (error) {
    console.error('[STORE CONTROLLER] getMyStores error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/stores/me - Auth: Current user's store
exports.getMyStore = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('[STORE CONTROLLER] Fetching my store for user:', userId);

    const store = await Store.findOne({ user: userId })
      .populate('user', 'name shopName avatar')
      .lean();
    if (!store) return res.status(404).json({ message: 'No store found' });
    res.json(store);
  } catch (error) {
    console.error('[STORE CONTROLLER] getMyStore error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/stores/my-products - Auth: User's store products
exports.getMyProducts = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('[STORE CONTROLLER] Fetching products for user:', userId);

    const products = await Product.find({ user: userId })
      .populate('user', 'name shopName')
      .sort({ createdAt: -1 })
      .lean();
    res.json(products);
  } catch (error) {
    console.error('[STORE CONTROLLER] getMyProducts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/stores/my-analytics - Auth: Basic analytics
exports.getMyAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('[STORE CONTROLLER] Fetching analytics for user:', userId);

    const store = await Store.findOne({ user: userId });
    if (!store) return res.status(404).json({ message: 'No store found' });

    const productCount = await Product.countDocuments({ user: userId });
    // Extend: Add Order aggregate for sales/views if Orders model ready

    res.json({
      storeId: store._id,
      productCount,
      totalViews: 0, // Placeholder
      totalSales: 0, // Placeholder
      avgRating: store.avgRating || 0
    });
  } catch (error) {
    console.error('[STORE CONTROLLER] getMyAnalytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/stores/products - Auth: Create store product (with images)
exports.createStoreProduct = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('[STORE CONTROLLER] Creating product for user:', userId);

    const store = await Store.findOne({ user: userId });
    if (!store) return res.status(404).json({ message: 'Store not found' });

    const product = new Product({
      ...req.body,
      user: userId,
      store: store._id,
      images: req.files ? req.files.map(file => ({ url: file.path })) : []
    });
    await product.save();
    await product.populate('user store', 'name shopName');

    console.log('[STORE CONTROLLER] Product created:', product._id);
    res.status(201).json(product);
  } catch (error) {
    console.error('[STORE CONTROLLER] createStoreProduct error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/stores/products/:id - Auth: Update store product
exports.updateStoreProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    console.log('[STORE CONTROLLER] Updating product:', id, 'for user:', userId);

    const product = await Product.findOne({ _id: id, user: userId });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    Object.assign(product, req.body);
    if (req.files) product.images = req.files.map(file => ({ url: file.path }));
    await product.save();
    await product.populate('user store', 'name shopName');

    console.log('[STORE CONTROLLER] Product updated:', id);
    res.json(product);
  } catch (error) {
    console.error('[STORE CONTROLLER] updateStoreProduct error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
