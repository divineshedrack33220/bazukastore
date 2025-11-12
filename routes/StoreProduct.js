const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Store = require('../models/Store');
const auth = require('../middleware/auth');
const { cloudinary } = require('../config/cloudinary');

// Helper: Upload image to Cloudinary
async function uploadImage(file) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'bazuka/products' },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    // For memory storage, use buffer
    stream.end(file.buffer);
  });
}

// POST /api/store-products → Add product (with file upload)
router.post('/', auth, async (req, res) => {
  try {
    if (!req.files?.length) {
      return res.status(400).json({ message: 'At least one image required' });
    }

    const { name, description, price, dealPrice, stock, category } = req.body;
    if (!name || !price || stock == null || !category) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const store = await Store.findOne({ user: req.user.id });
    if (!store) return res.status(404).json({ message: 'Store not found' });

    const uploaded = await Promise.all(req.files.map(uploadImage));
    const images = uploaded.map(img => ({ url: img.url, public_id: img.public_id }));

    const product = new Product({
      name: name.trim(),
      description: description?.trim(),
      price: parseFloat(price),
      dealPrice: dealPrice ? parseFloat(dealPrice) : undefined,
      stock: parseInt(stock),
      category,
      images,
      store: store._id,
      user: req.user.id
    });

    await product.save();
    await product.populate('store', 'shopName');
    await product.populate('category', 'name');
    res.status(201).json(product);
  } catch (err) {
    console.error('Add product error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/store-products/:id → Update product (with optional new images)
router.put('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.user.toString() !== req.user.id) return res.status(403).json({ message: 'Unauthorized' });

    // Replace images if new ones uploaded
    if (req.files?.length) {
      for (const img of product.images) {
        await cloudinary.uploader.destroy(img.public_id).catch(() => {});
      }
      const uploaded = await Promise.all(req.files.map(uploadImage));
      product.images = uploaded.map(img => ({ url: img.url, public_id: img.public_id }));
    }

    product.name = req.body.name?.trim() || product.name;
    product.description = req.body.description?.trim() ?? product.description;
    product.price = parseFloat(req.body.price) || product.price;
    product.dealPrice = req.body.dealPrice ? parseFloat(dealPrice) : undefined;
    product.stock = parseInt(req.body.stock) ?? product.stock;
    product.category = req.body.category || product.category;

    await product.save();
    await product.populate('store', 'shopName');
    await product.populate('category', 'name');
    res.json(product);
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/store-products/:id → Delete product + Cloudinary
router.delete('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.user.toString() !== req.user.id) return res.status(403).json({ message: 'Unauthorized' });

    for (const img of product.images) {
      await cloudinary.uploader.destroy(img.public_id).catch(() => {});
    }

    await product.deleteOne();
    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/store-products/my-products → Seller's products
router.get('/my-products', auth, async (req, res) => {
  try {
    const store = await Store.findOne({ user: req.user.id });
    if (!store) return res.status(404).json({ message: 'Store not found' });

    const products = await Product.find({ store: store._id })
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json(products);
  } catch (err) {
    console.error('My products error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Public: List products
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', category } = req.query;
    const skip = (page - 1) * limit;

    const query = { stock: { $gt: 0 } };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (category && category !== 'all') query.category = category;

    const products = await Product.find(query)
      .populate({ path: 'store', select: 'shopName banner verified', match: { shopName: { $exists: true, $ne: null } } })
      .populate({ path: 'user', select: 'name shopName avatar' })
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const validProducts = products.filter(p => p.store);
    const total = await Product.countDocuments(query);

    res.json({
      products: validProducts,
      total,
      page: +page,
      pages: Math.ceil(total / limit),
      message: validProducts.length ? undefined : 'No products found'
    });
  } catch (err) {
    console.error('storeProducts route error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Public: Get single product
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
