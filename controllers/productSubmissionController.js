// controllers/productSubmissionController.js
const ProductSubmission = require('../models/ProductSubmission');
const User = require('../models/User');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Submit a new product
const submitProduct = async (req, res) => {
  try {
    const {
      name, shopName, description, price, dealPrice, category,
      sellerName, sellerPhone, sellerCountry, sellerAddress
    } = req.body;

    if (!name || !shopName || !description || !price || !dealPrice || !category) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    if (parseFloat(price) <= 0 || parseFloat(dealPrice) <= 0) {
      return res.status(400).json({ error: 'Prices must be greater than 0' });
    }

    if (parseFloat(dealPrice) > parseFloat(price)) {
      return res.status(400).json({ error: 'Deal price cannot be higher than original price' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Block unapproved sellers with pending submissions
    if (!user.isApprovedSeller) {
      const pendingCount = await ProductSubmission.countDocuments({ seller: req.user._id, status: 'pending' });
      if (pendingCount > 0) {
        return res.status(403).json({ error: 'You have a pending submission. Please wait for approval.' });
      }
      if (!sellerName || !sellerPhone || !sellerCountry || !sellerAddress) {
        return res.status(400).json({ error: 'All seller fields are required for unapproved sellers' });
      }
    }

    let image = null;
    if (req.files?.image) {
      const file = req.files.image;
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'product_submissions' },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            throw new Error('Failed to upload image to Cloudinary');
          }
          image = {
            url: result.secure_url,
            public_id: result.public_id,
          };
        }
      );
      streamifier.createReadStream(file.data).pipe(uploadStream);

      // Wait for upload to complete
      await new Promise(resolve => uploadStream.on('finish', resolve));
    }

    const submission = new ProductSubmission({
      name,
      shopName,
      description,
      price: parseFloat(price),
      dealPrice: parseFloat(dealPrice),
      category,
      image,
      seller: req.user._id,
      sellerName: user.isApprovedSeller ? undefined : sellerName,
      sellerPhone: user.isApprovedSeller ? undefined : sellerPhone,
      sellerCountry: user.isApprovedSeller ? undefined : sellerCountry,
      sellerAddress: user.isApprovedSeller ? undefined : sellerAddress,
      status: 'pending',
    });

    await submission.save();

    const io = req.app.get('io');
    io.to('adminRoom').emit('submissionUpdate');

    res.status(201).json({ message: 'Product submitted for approval', submission });
  } catch (error) {
    console.error('Error submitting product:', error);
    res.status(400).json({ error: error.message });
  }
};

// Check if user has pending submissions
const checkPendingStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const pendingCount = await ProductSubmission.countDocuments({ seller: req.user._id, status: 'pending' });
    res.json({
      isApprovedSeller: user.isApprovedSeller,
      hasPendingListings: pendingCount > 0,
      shopName: user.shopName,
    });
  } catch (error) {
    console.error('Error checking pending status:', error);
    res.status(500).json({ error: 'Failed to check pending status' });
  }
};

// Get all listings for the logged-in user
const getMyListings = async (req, res) => {
  try {
    const listings = await ProductSubmission.find({ seller: req.user._id });
    res.json(listings);
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
};

// ✅ Export everything properly
module.exports = {
  submitProduct,
  checkPendingStatus,
  getMyListings,
};
