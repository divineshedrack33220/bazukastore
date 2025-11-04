// models/Chat.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String },
  isImage: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // REPLY-TO-MESSAGE
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
});

const chatSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastMessage: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = {
  Chat: mongoose.model('Chat', chatSchema),
  Message: mongoose.model('Message', messageSchema),
};