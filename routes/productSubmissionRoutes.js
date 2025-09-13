// routes/productSubmissionRoutes.js
const express = require('express');
const router = express.Router();
const { submitProduct, checkPendingStatus, getMyListings } = require('../controllers/productSubmissionController');
const auth = require('../middleware/auth');

console.log('✅ Registering product submission routes');

router.post('/', auth, submitProduct);
router.get('/pending-status', auth, checkPendingStatus);
router.get('/my-listings', auth, getMyListings); // Added

module.exports = router;