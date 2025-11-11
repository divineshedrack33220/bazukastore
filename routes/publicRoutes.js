const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Request = require('../models/Request');
const User = require('../models/User'); // NEW: Import User model (create if missing—see Next Steps)
const router = express.Router();

// Public product routes (UNCHANGED)
router.get('/products', async (req, res) => {
    try {
        const { priceRange, sort, category, search, ids } = req.query;
        let query = {};
        if (priceRange) {
            const [min, max] = priceRange.split('-').map(Number);
            query.price = { $gte: min, $lte: max };
        }
        if (category) query.category = category;
        if (search) query.name = { $regex: search, $options: 'i' };
        if (ids) query._id = { $in: ids.split(',') };

        const sortOptions = {};
        if (sort === 'discount-desc') sortOptions.discount = -1;
        if (sort === 'rating-desc') sortOptions.rating = -1;

        const products = await Product.find(query).sort(sortOptions);
        res.json(products);
    } catch (error) {
        console.error('[PUBLIC ROUTES] /products error:', error); // NEW: Log full error for debugging
        res.status(500).json({ message: 'Server error' });
    }
});

// Public category routes (UNCHANGED, with logging)
router.get('/categories', async (req, res) => {
    try {
        const categories = await Category.find().select('name icon itemCount');
        res.json(categories);
    } catch (error) {
        console.error('[PUBLIC ROUTES] /categories error:', error); // NEW: Log full error
        res.status(500).json({ message: 'Server error' });
    }
});

// Public request routes (UNCHANGED, with logging)
router.get('/requests', async (req, res) => {
    try {
        const { page = 1, limit = 10, category, sort = 'createdAt-desc' } = req.query;
        const query = category ? { category } : {};
        const sortField = sort === 'upvotes-desc' ? { upvotes: -1 } : { createdAt: -1 };

        const requests = await Request.find(query)
            .populate('user', 'name avatar')
            .sort(sortField)
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .lean();

        const userId = req.user ? req.user.id : null;
        const modifiedRequests = requests.map(request => ({
            ...request,
            userVote: userId ? request.votes.find(v => v.user.toString() === userId)?.vote || 0 : 0,
        }));

        const total = await Request.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        res.json({ requests: modifiedRequests, totalPages });
    } catch (error) {
        console.error('[PUBLIC ROUTES] /requests error:', error); // NEW: Log full error
        res.status(500).json({ message: 'Server error' });
    }
});

// NEW/UPDATED: Public stores route (top sellers—now with logging & safer aggregate)
router.get('/stores', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        console.log('[PUBLIC ROUTES] /stores query:', { limit }); // NEW: Log incoming params

        // Check if User model is available
        if (!User) {
            throw new Error('User model not found—check import path in routes/public.js');
        }

        const stores = await User.aggregate([
            // Match users who are stores/sellers (flexible: shopName OR a 'isSeller' flag if you have it)
            {
                $match: {
                    $or: [
                        { shopName: { $exists: true, $ne: null, $ne: '' } }, // Primary filter
                        { isSeller: true } // Fallback if you use a boolean flag
                    ]
                }
            },
            // Lookup user's products for count and avg rating
            {
                $lookup: {
                    from: 'products', // Assumes Mongoose collection name (lowercase plural)
                    localField: '_id',
                    foreignField: 'user', // FIXED: Matches your Product schema 'user' ref (was 'userId')
                    as: 'products'
                }
            },
            // Compute stats (safer: handle empty products array)
            {
                $addFields: {
                    productCount: { $size: '$products' },
                    avgRating: { 
                        $cond: {
                            if: { $gt: [{ $size: '$products' }, 0] },
                            then: { $avg: '$products.rating' },
                            else: 0
                        }
                    }
                }
            },
            // Shape response to match frontend (user object + stats)
            {
                $addFields: {
                    user: {
                        _id: '$_id',
                        name: '$name',
                        shopName: { $ifNull: ['$shopName', '$name'] }, // Fallback to name if no shopName
                        avatar: { $ifNull: ['$avatar', null] }
                    }
                }
            },
            // FIXED: Clean up with $unset (avoids $project inclusion/exclusion mix-up)
            { $unset: ['products'] }, // Drops heavy products array safely
            // Sort: highest rating first, then most products
            { $sort: { avgRating: -1, productCount: -1 } },
            // Limit results
            { $limit: parseInt(limit) }
        ]);

        console.log('[PUBLIC ROUTES] /stores success: fetched', stores.length, 'stores'); // NEW: Log success
        res.json(stores); // Array of { user: {...}, avgRating, productCount }
    } catch (error) {
        console.error('[PUBLIC ROUTES] /stores error:', error); // NEW: Log full error (check server console!)
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;