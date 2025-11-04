const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/', 
  (req, res, next) => {
    console.log('POST /api/requests route handler reached');
    console.log('Request headers:', req.headers);
    console.log('Request body (raw):', req.body);
    console.log('Request files (pre-upload):', req.files);
    next();
  },
  upload.array('images', 5),
  auth,
  (req, res, next) => {
    console.log('After upload middleware:');
    console.log('Parsed body:', req.body);
    console.log('Parsed files:', req.files);
    next();
  },
  requestController.createRequest
);

router.get('/public/requests', requestController.getRequests);
router.get('/:id', requestController.getRequestById);
router.post('/:id/vote', auth, requestController.voteRequest);

module.exports = router;