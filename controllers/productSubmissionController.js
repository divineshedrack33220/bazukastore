const ProductSubmission = require('../models/ProductSubmission');
const User = require('../models/User');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const submitProduct = async (req, res) => {
  try {
    console.log('Request headers:', req.headers);
    console.log('Request body:', req.body);
    console.log('Request files:', req.files || 'No files uploaded');

    // Check for Multer errors
    if (req.fileValidationError) {
      console.error('Multer validation error:', req.fileValidationError);
      return res.status(400).json({ error: `File upload error: ${req.fileValidationError.message}` });
    }

    if (!req.body || !Object.keys(req.body).length) {
      return res.status(400).json({ error: 'No form data received' });
    }

    const { name, shopName, description, price, dealPrice, category } = req.body;

    if (!name || !shopName || !description || !price || !dealPrice || !category) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    const parsedPrice = parseFloat(price);
    const parsedDealPrice = parseFloat(dealPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0 || isNaN(parsedDealPrice) || parsedDealPrice <= 0) {
      return res.status(400).json({ error: 'Prices must be valid numbers greater than 0' });
    }

    if (parsedDealPrice > parsedPrice) {
      return res.status(400).json({ error: 'Deal price cannot be higher than original price' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const images = [];
    if (req.files && req.files.length) {
      console.log('Processing files for upload:', req.files.length);
      for (const file of req.files.slice(0, 5)) {
        console.log('File details:', {
          name: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          path: file.path,
        });

        try {
          const result = await Promise.race([
            cloudinary.uploader.upload(file.path, {
              folder: 'product_submissions',
              resource_type: 'image',
              transformation: [{ quality: 'auto', fetch_format: 'auto' }],
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Cloudinary upload timeout')), 30000)
            ),
          ]);

          images.push({
            url: result.secure_url,
            public_id: result.public_id,
          });
          console.log('Cloudinary upload successful:', images[images.length - 1]);

          await fs.unlink(file.path).catch(err => console.error('Error deleting temp file:', err));
        } catch (uploadError) {
          console.error('Cloudinary upload error:', uploadError);
          await fs.unlink(file.path).catch(err => console.error('Error deleting temp file:', err));
          return res.status(500).json({ error: 'Failed to upload image to Cloudinary: ' + uploadError.message });
        }
      }
    } else {
      console.log('No files provided in the request');
    }

    const submission = new ProductSubmission({
      name,
      shopName,
      description,
      price: parsedPrice,
      dealPrice: parsedDealPrice,
      category,
      images,
      seller: req.user._id,
      views: 0,
    });

    await submission.save();
    await User.findByIdAndUpdate(req.user._id, { shopName }, { new: true });

    const io = req.app.get('io');
    if (io) {
      io.to('adminRoom').emit('submissionUpdate');
    } else {
      console.warn('Socket.IO not initialized');
    }

    res.status(201).json({ message: 'Product listed successfully', submission });
  } catch (error) {
    console.error('Error listing product:', error);
    if (req.files && req.files.length) {
      for (const file of req.files) {
        await fs.unlink(file.path).catch(err => console.error('Error deleting temp file:', err));
      }
    }
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

const updateProduct = async (req, res) => {
  try {
    console.log('Update request headers:', req.headers);
    console.log('Update request body:', req.body);
    console.log('Update request files:', req.files || 'No files uploaded');

    // Check for Multer errors
    if (req.fileValidationError) {
      console.error('Multer validation error:', req.fileValidationError);
      return res.status(400).json({ error: `File upload error: ${req.fileValidationError.message}` });
    }

    const productId = req.params.id;
    const { name, shopName, description, price, dealPrice, category } = req.body;

    if (!name || !shopName || !description || !price || !dealPrice || !category) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    const parsedPrice = parseFloat(price);
    const parsedDealPrice = parseFloat(dealPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0 || isNaN(parsedDealPrice) || parsedDealPrice <= 0) {
      return res.status(400).json({ error: 'Prices must be valid numbers greater than 0' });
    }

    if (parsedDealPrice > parsedPrice) {
      return res.status(400).json({ error: 'Deal price cannot be higher than original price' });
    }

    const product = await ProductSubmission.findOne({ _id: productId, seller: req.user._id });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const images = [];
    if (req.files && req.files.length) {
      console.log('Processing files for update:', req.files.length);
      for (const file of req.files.slice(0, 5)) {
        try {
          const result = await Promise.race([
            cloudinary.uploader.upload(file.path, {
              folder: 'product_submissions',
              resource_type: 'image',
              transformation: [{ quality: 'auto', fetch_format: 'auto' }],
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Cloudinary upload timeout')), 30000)
            ),
          ]);

          images.push({
            url: result.secure_url,
            public_id: result.public_id,
          });
          console.log('Cloudinary upload successful:', images[images.length - 1]);

          await fs.unlink(file.path).catch(err => console.error('Error deleting temp file:', err));
        } catch (uploadError) {
          console.error('Cloudinary upload error:', uploadError);
          await fs.unlink(file.path).catch(err => console.error('Error deleting temp file:', err));
          return res.status(500).json({ error: 'Failed to upload image to Cloudinary: ' + uploadError.message });
        }
      }
      // Delete old images from Cloudinary
      if (product.images?.length) {
        for (const img of product.images) {
          await cloudinary.uploader.destroy(img.public_id).catch(err => console.error('Error deleting old image:', err));
        }
      }
    }

    const updateData = {
      name,
      shopName,
      description,
      price: parsedPrice,
      dealPrice: parsedDealPrice,
      category,
    };
    if (images.length) updateData.images = images;

    const updatedProduct = await ProductSubmission.findOneAndUpdate(
      { _id: productId, seller: req.user._id },
      updateData,
      { new: true }
    );

    await User.findByIdAndUpdate(req.user._id, { shopName }, { new: true });

    res.json({ message: 'Product updated successfully', product: updatedProduct });
  } catch (error) {
    console.error('Error updating product:', error);
    if (req.files && req.files.length) {
      for (const file of req.files) {
        await fs.unlink(file.path).catch(err => console.error('Error deleting temp file:', err));
      }
    }
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await ProductSubmission.findOneAndDelete({ _id: productId, seller: req.user._id });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.images?.length) {
      for (const img of product.images) {
        await cloudinary.uploader.destroy(img.public_id).catch(err => console.error('Error deleting image:', err));
      }
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

const getProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await ProductSubmission.findOne({ _id: productId, seller: req.user._id });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    product.views = (product.views || 0) + 1;
    await product.save();
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

const checkPendingStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      shopName: user.shopName || '',
    });
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
};

const getMyListings = async (req, res) => {
  try {
    const listings = await ProductSubmission.find({ seller: req.user._id }).sort({ createdAt: -1 });
    res.json(listings);
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
};

const boostListing = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await ProductSubmission.findOne({
      _id: productId,
      seller: req.user._id,
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    product.isBoosted = true;
    await product.save();
    res.json({ message: 'Boost request submitted' });
  } catch (error) {
    console.error('Error boosting listing:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  submitProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  checkPendingStatus,
  getMyListings,
  boostListing,
};