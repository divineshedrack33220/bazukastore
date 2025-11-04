const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  category: {
    type: String,
    required: true,
    enum: [
      'buy-product', 'sell-product', 'rent-product', 'sell-building', 'rent-property',
      'sell-land', 'lease-commercial', 'sell-service', 'buy-service', 'hire-freelancer',
      'job', 'internship', 'volunteer'
    ],
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  price: {
    type: Number,
    min: 0,
  },
  location: {
    type: String,
    trim: true,
  },
  phoneNumber: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        return !v || /^0[789][01][0-9]{8}$/.test(v);
      },
      message: 'Invalid phone number format. Use 070, 080, 081, 090, or 091 followed by 8 digits.',
    },
  },
  images: [{
    type: String,
    trim: true,
  }],
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'fulfilled'],
    default: 'pending',
  },
  upvotes: {
    type: Number,
    default: 0,
  },
  downvotes: {
    type: Number,
    default: 0,
  },
  userVote: {
    type: Number,
    enum: [0, 1, -1],
    default: 0,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Request', requestSchema);