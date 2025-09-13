// models/ProductSubmission.js
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
    image: {
        url: String,
        public_id: String,
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Seller is required'],
    },
    sellerName: { type: String },
    sellerPhone: { type: String },
    sellerCountry: { type: String },
    sellerAddress: { type: String },
    status: {
        type: String,
        enum: ['pending', 'approved'],
        default: 'pending',
    },
    isBoosted: { // Added
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('ProductSubmission', productSubmissionSchema);