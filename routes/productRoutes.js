const express = require('express');
const router = express.Router();
const { createProduct, getProducts, getUserListings, getProductById, updateProduct, deleteProduct, addStarRating } = require('../controllers/productController');
const auth = require('../middleware/auth');

console.log('✅ Registering product routes');

// Public routes
router.get('/', getProducts);
router.get('/:id', getProductById);

// Authenticated routes
router.post('/', auth, createProduct);
router.get('/my-listings', auth, getUserListings);
router.put('/:id', auth, updateProduct);
router.delete('/:id', auth, deleteProduct);
router.post('/:id/reviews', auth, addStarRating);

module.exports = router;
