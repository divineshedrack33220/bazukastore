const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Debug middleware to confirm route is reached
router.post('/', (req, res, next) => {
  console.log('POST /api/requests route handler reached');
  next();
}, auth, upload.single('image'), requestController.createRequest);

router.get('/public/requests', requestController.getRequests);

router.get('/:id', requestController.getRequestById);

router.post('/:id/vote', auth, requestController.voteRequest);

module.exports = router;