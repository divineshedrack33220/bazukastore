const cloudinary = require('../config/cloudinary');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Multer setup: Temp disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Create 'uploads' folder if not exists
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed!'), false);
    }
  },
});

exports.uploadImages = [
  upload.array('images', 10), // Up to 10 images
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No images uploaded' });
      }

      const urls = [];
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'chat-images', // Optional: Organize in Cloudinary
        });
        urls.push(result.secure_url); // Full secure URL
        await fs.unlink(file.path); // Delete temp file
      }

      res.status(200).json({ urls });
    } catch (error) {
      // Clean up temp files on error
      if (req.files) {
        req.files.forEach(file => fs.unlink(file.path).catch(() => {}));
      }
      console.error('Upload error:', error);
      res.status(500).json({ message: error.message });
    }
  },
];