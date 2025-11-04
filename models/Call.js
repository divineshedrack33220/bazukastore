const mongoose = require('mongoose');

const callSchema = new mongoose.Schema({
  caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'accepted', 'rejected', 'missed', 'ended'],
    default: 'initiated'
  },
  startedAt: { type: Date },
  endedAt: { type: Date },
  duration: { type: Number } // in seconds
}, { timestamps: true });

module.exports = mongoose.model('Call', callSchema);