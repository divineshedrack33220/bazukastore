const Product = require('../models/Product');
const Category = require('../models/Category');
const upload = require('../middleware/upload');
const mongoose = require('mongoose');

const createProduct = [
  upload.array('images', 5),
  async (req, res) => {
    try {
      const {
        name, description, price, dealPrice, originalPrice, discount, category, stock, specifications,
        isFlashDeal, isBestSeller, isUnder5k, isUnder10k
      } = req.body;

      const images = req.files.map(file => ({
        url: file.path,
        public_id: file.filename,
      }));

      const product = new Product({
        name,
        description,
        price: parseFloat(price),
        dealPrice: dealPrice ? parseFloat(dealPrice) : undefined,
        originalPrice: originalPrice ? parseFloat(originalPrice) : undefined,
        discount: discount ? parseFloat(discount) : undefined,
        images,
        category,
        stock: parseInt(stock),
        specifications: specifications ? JSON.parse(specifications) : undefined,
        isFlashDeal: isFlashDeal === 'true',
        isBestSeller: isBestSeller === 'true',
        isUnder5k: isUnder5k === 'true',
        isUnder10k: isUnder10k === 'true',
        user: req.user._id,
        store: req.user.store, // assuming user has store
      });

      await product.save();

      await Category.findByIdAndUpdate(category, { $inc: { itemCount: 1 } });

      const io = req.app.get('io');
      io.to('adminRoom').emit('productUpdate');

      res.status(201).json(product);
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(400).json({ error: error.message });
    }
  }
];

// UPDATED: getProducts with `store` filter + populate store
const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      priceRange,
      sort,
      isFlashDeal,
      isBestSeller,
      isUnder5k,
      isUnder10k,
      search,
      store // NEW: filter by store ID
    } = req.query;

    const query = {};

    // Search
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Category
    if (category) query.category = category;

    // Price range
    if (priceRange) {
      const [min, max] = priceRange.split('-').map(Number);
      if (!isNaN(min) || !isNaN(max)) {
        query.price = {};
        if (!isNaN(min)) query.price.$gte = min;
        if (!isNaN(max)) query.price.$lte = max;
      }
    }

    // Boolean flags
    if (isFlashDeal === 'true') query.isFlashDeal = true;
    if (isBestSeller === 'true') query.isBestSeller = true;
    if (isUnder5k === 'true') query.isUnder5k = true;
    if (isUnder10k === 'true') query.isUnder10k = true;

    // NEW: Store filter
    if (store && mongoose.isValidObjectId(store)) {
      query.store = store;
    }

    // Sorting
    const sortOptions = {};
    if (sort) {
      const [field, direction] = sort.split('-');
      sortOptions[field] = direction === 'desc' ? -1 : 1;
    } else {
      sortOptions.createdAt = -1;
    }

    const skip = (page - 1) * limit;
    const limitNum = parseInt(limit);

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name')
        .populate('store', 'shopName') // populate store name
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    res.json({
      products,
      pagination: {
        current: Number(page),
        pages: Math.ceil(total / limitNum),
        total
      }
    });
  } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ error: 'Failed to fetch products' });
  }
};

const getUserListings = async (req, res) => {
  try {
    const { page = 1, limit = 10, sort } = req.query;
    const query = { user: req.user._id };

    const sortOptions = {};
    if (sort) {
      const [field, direction] = sort.split('-');
      sortOptions[field] = direction === 'desc' ? -1 : 1;
    }

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('store', 'shopName')
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Product.countDocuments(query);

    res.json({ products, total });
  } catch (error) {
    console.error('Error fetching user listings:', error);
    res.status(500).json({ error: 'Failed to fetch user listings' });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    
    const product = await Product.findById(id)
      .populate('category', 'name')
      .populate('store', 'shopName')
      .populate('reviews.user', 'name')
      .lean();
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
};

const updateProduct = [
  upload.array('images', 5),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name, description, price, dealPrice, originalPrice, discount, category, stock, specifications,
        isFlashDeal, isBestSeller, isUnder5k, isUnder10k
      } = req.body;

      const product = await Product.findById(id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      if (product.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Not authorized to update this product' });
      }

      const oldCategory = product.category;

      product.name = name || product.name;
      product.description = description || product.description;
      product.price = price ? parseFloat(price) : product.price;
      product.dealPrice = dealPrice ? parseFloat(dealPrice) : product.dealPrice;
      product.originalPrice = originalPrice ? parseFloat(originalPrice) : product.originalPrice;
      product.discount = discount ? parseFloat(discount) : product.discount;
      product.category = category || product.category;
      product.stock = stock ? parseInt(stock) : product.stock;
      product.specifications = specifications ? JSON.parse(specifications) : product.specifications;
      product.isFlashDeal = isFlashDeal === 'true' ? true : isFlashDeal === 'false' ? false : product.isFlashDeal;
      product.isBestSeller = isBestSeller === 'true' ? true : isBestSeller === 'false' ? false : product.isBestSeller;
      product.isUnder5k = isUnder5k === 'true' ? true : isUnder5k === 'false' ? false : product.isUnder5k;
      product.isUnder10k = isUnder10k === 'true' ? true : isUnder10k === 'false' ? false : product.isUnder10k;

      if (req.files.length > 0) {
        product.images = req.files.map(file => ({
          url: file.path,
          public_id: file.filename,
        }));
      }

      await product.save();

      if (oldCategory.toString() !== category) {
        await Category.findByIdAndUpdate(oldCategory, { $inc: { itemCount: -1 } });
        await Category.findByIdAndUpdate(category, { $inc: { itemCount: 1 } });
      }

      const io = req.app.get('io');
      io.to('adminRoom').emit('productUpdate');

      res.json(product);
    } catch (error) {
      console.error('Error updating product:', error);
      res.status(400).json({ error: error.message });
    }
  }
];

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this product' });
    }

    await Product.deleteOne({ _id: id });
    await Category.findByIdAndUpdate(product.category, { $inc: { itemCount: -1 } });

    const io = req.app.get('io');
    io.to('adminRoom').emit('productUpdate');

    res.json({ message: 'Product deleted' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
};

const addStarRating = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const existingReview = product.reviews.find(
      review => review.user.toString() === req.user._id.toString()
    );
    if (existingReview) {
      return res.status(400).json({ error: 'You have already rated this product' });
    }

    const review = {
      user: req.user._id,
      rating: parseInt(rating),
      createdAt: new Date(),
    };

    product.reviews.push(review);

    const totalRating = product.reviews.reduce((sum, r) => sum + r.rating, 0);
    product.rating = totalRating / product.reviews.length;

    await product.save();

    const io = req.app.get('io');
    io.to('adminRoom').emit('productUpdate');

    res.status(201).json({ message: 'Rating added', review });
  } catch (error) {
    console.error('Error adding rating:', error);
    res.status(500).json({ error: 'Failed to add rating' });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getUserListings,
  getProductById,
  updateProduct,
  deleteProduct,
  addStarRating,
};