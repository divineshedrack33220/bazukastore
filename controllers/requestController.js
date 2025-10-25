const Request = require('../models/Request');

exports.getRequests = async (req, res) => {
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
};

exports.getRequestById = async (req, res) => {
    try {
        const request = await Request.findById(req.params.id)
            .populate('user', 'name avatar')
            .lean();

        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        const userId = req.user ? req.user.id : null;
        const modifiedRequest = {
            ...request,
            userVote: userId ? request.votes.find(v => v.user.toString() === userId)?.vote || 0 : 0,
        };

        res.json(modifiedRequest);
    } catch (error) {
        console.error('Error fetching request by ID:', error);
        res.status(404).json({ message: 'Request not found' });
    }
};

exports.createRequest = async (req, res) => {
    try {
        const { category, title, description, price, location } = req.body;
        const image = req.file ? req.file.path : null; // Cloudinary returns path as secure_url

        // Validate required fields
        if (!category || !title || !description) {
            return res.status(400).json({ message: 'Category, title, and description are required' });
        }

        // Check if user is authenticated
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: 'User not authenticated. Please provide a valid token.' });
        }

        // Validate user ID format (ensure it's a valid ObjectId)
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
            return res.status(400).json({ message: 'Invalid user ID format' });
        }

        const request = new Request({
            user: req.user.id,
            category,
            title,
            description,
            price: price ? parseFloat(price) : null,
            location,
            image,
        });

        await request.save();

        const io = req.app.get('io');
        io.to('adminRoom').emit('requestUpdate', { requestId: request._id });
        io.to(`user_${req.user.id}`).emit('requestUpdate', { requestId: request._id });

        res.status(201).json({ message: 'Request created successfully', request });
    } catch (error) {
        console.error('Error creating request:', error);
        res.status(400).json({ message: error.message || 'Failed to create request' });
    }
};

exports.voteRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { vote } = req.body;
        const userId = req.user.id;

        if (![1, -1].includes(vote)) {
            return res.status(400).json({ message: 'Invalid vote value' });
        }

        const request = await Request.findById(id);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        const existingVote = request.votes.find(v => v.user.toString() === userId);
        if (existingVote) {
            if (existingVote.vote === vote) {
                request.votes = request.votes.filter(v => v.user.toString() !== userId);
                if (vote === 1) request.upvotes = Math.max(0, request.upvotes - 1);
                else request.downvotes = Math.max(0, request.downvotes - 1);
            } else {
                existingVote.vote = vote;
                if (vote === 1) {
                    request.upvotes += 1;
                    request.downvotes = Math.max(0, request.downvotes - 1);
                } else {
                    request.downvotes += 1;
                    request.upvotes = Math.max(0, request.upvotes - 1);
                }
            }
        } else {
            request.votes.push({ user: userId, vote });
            if (vote === 1) request.upvotes += 1;
            else request.downvotes += 1;
        }

        await request.save();

        const io = req.app.get('io');
        io.to('adminRoom').emit('requestVoteUpdate', { requestId: id, upvotes: request.upvotes, downvotes: request.downvotes });
        io.to(`user_${userId}`).emit('requestVoteUpdate', { requestId: id, userVote: vote });

        res.json({ message: 'Vote recorded' });
    } catch (error) {
        console.error('Error voting on request:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = exports;