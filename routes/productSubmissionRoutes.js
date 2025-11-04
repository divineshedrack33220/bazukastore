const express = require('express');
const router = express.Router();
const { submitProduct, updateProduct, deleteProduct, getProduct, checkPendingStatus, getMyListings, boostListing } = require('../controllers/productSubmissionController');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../Uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5, // Max 5 files
    fieldSize: 10 * 1024 * 1024, // 10MB for fields
    parts: 10 // Max 10 parts (fields + files)
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  }
});

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Unexpected field name. Expected "images" for file uploads.' });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 5MB limit.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Maximum 5 images allowed.' });
    }
    return res.status(400).json({ error: `Multer error: ${err.message}` });
  }
  if (err.message === 'Only image files are allowed') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
};

console.log('✅ Registering product submission routes');

router.post('/', auth, upload.array('images', 5), handleMulterError, submitProduct);
router.put('/:id', auth, upload.array('images', 5), handleMulterError, updateProduct);
router.delete('/:id', auth, deleteProduct);
router.get('/status', auth, checkPendingStatus);
router.get('/my-listings', auth, getMyListings);
router.get('/:id', auth, getProduct);
router.post('/:id/boost', auth, boostListing);

module.exports = router;