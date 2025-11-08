const mongoose = require('mongoose');

const productSubmissionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
    },
    shopName: {
        type: String,
        required: [true, 'Shop name is required'],
        trim: true,
    },
    description: {
        type: String,
        required: [true, 'Product description is required'],
        trim: true,
    },
    price: {
        type: Number,
        required: [true, 'Product price is required'],
        min: [0, 'Price cannot be negative'],
    },
    dealPrice: {
        type: Number,
        required: [true, 'Deal price is required'],
        min: [0, 'Deal price cannot be negative'],
    },
    category: {
        type: String,
        required: [true, 'Product category is required'],
    },
    images: [{
        url: String,
        public_id: String,
    }],
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Seller is required'],
    },
    isBoosted: {
        type: Boolean,
        default: false,
    },
    views: {
        type: Number,
        default: 0,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('ProductSubmission', productSubmissionSchema);