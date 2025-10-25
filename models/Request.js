const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number },
    location: { type: String },
    image: { type: String }, // Stores Cloudinary secure_url
    status: { type: String, enum: ['Pending', 'Reviewed', 'Fulfilled'], default: 'Pending' },
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    votes: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, vote: { type: Number, enum: [1, -1] } }],
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Request', requestSchema);