const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Request = require('../models/Request');
const router = express.Router();

// Public product routes
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
        res.status(500).json({ message: 'Server error' });
    }
});

// Public category routes
router.get('/categories', async (req, res) => {
    try {
        const categories = await Category.find().select('name icon itemCount');
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Public request routes
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
        console.error('Error fetching requests:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;