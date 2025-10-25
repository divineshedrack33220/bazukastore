const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'));
    }
  },
});

router.post('/upload-proof', auth, upload.single('proof'), orderController.uploadPaymentProof);
router.post('/', auth, orderController.createOrder);
router.get('/', auth, orderController.getOrders);
router.get('/sales', auth, orderController.getSalesMetrics);
router.get('/export', auth, orderController.exportOrders);
router.get('/track', auth, orderController.trackOrder);
router.get('/:id', auth, orderController.getOrder);
router.patch('/:id', auth, orderController.updateOrderStatus);

module.exports = router;