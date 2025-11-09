// routes/storeProducts.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product'); // ← We use real Product model
const Store = require('../models/Store');

// GET /api/store-products → Public: Latest products from active stores
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', category } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    const query = { stock: { $gt: 0 } }; // Only in-stock

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (category && category !== 'all') {
      query.category = category;
    }

    // Fetch products + populate store & user
    const products = await Product.find(query)
      .populate({
        path: 'store',
        select: 'shopName banner verified',
        match: { shopName: { $exists: true, $ne: null } }
      })
      .populate({
        path: 'user',
        select: 'name shopName avatar'
      })
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Filter out products where store was not found (null after populate)
    const validProducts = products.filter(p => p.store);

    const total = await Product.countDocuments(query);

    res.json({
      products: validProducts,
      total,
      page: +page,
      pages: Math.ceil(total / limit),
      message: validProducts.length ? undefined : 'No products found in active stores'
    });

  } catch (err) {
    console.error('storeProducts route error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/store-products/:id → Single product by ID
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('store', 'shopName banner verified')
      .populate('user', 'name shopName avatar')
      .populate('category', 'name')
      .lean();

    if (!product || !product.store) {
      return res.status(404).json({ message: 'Product not found or store inactive' });
    }

    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;