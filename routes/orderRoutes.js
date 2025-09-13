// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');

router.post('/', auth, orderController.createOrder);
router.get('/', auth, orderController.getOrders);
router.get('/sales', auth, orderController.getSalesMetrics);
router.get('/export', auth, orderController.exportOrders);
router.get('/track', auth, orderController.trackOrder);
router.get('/:id', auth, orderController.getOrder);
router.patch('/:id', auth, orderController.updateOrderStatus);

module.exports = router;