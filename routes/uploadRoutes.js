const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');

// Ensure Uploads directory exists
const uploadDir = path.join(__dirname, '../Uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    const isValid = allowedTypes.test(ext) && allowedTypes.test(file.mimetype);
    cb(null, isValid);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.post('/', auth, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }
    const url = `/Uploads/${req.file.filename}`;
    res.json({ url });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(400).json({ message: error.message || 'Upload failed' });
  }
});

module.exports = router;