const express = require('express');
const router = express.Router();
const { Message, Chat } = require('../models/Chat');
const auth = require('../middleware/auth');

// POST /api/messages
router.post('/', auth, async (req, res) => {
  try {
    const { chatId, content, isImage } = req.body;
    if (!chatId || !content) {
      return res.status(400).json({ message: 'chatId and content are required' });
    }
    const message = new Message({
      chatId,
      sender: req.user._id,
      content,
      isImage: isImage || false,
      createdAt: new Date(),
    });
    await message.save();
    await Chat.findByIdAndUpdate(chatId, {
      lastMessage: content,
      updatedAt: new Date(),
    });
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', '_id name');
    
    // Emit chatUpdate to refresh chat-list.html
    const io = req.app.get('io');
    const chat = await Chat.findById(chatId).populate('participants', '_id name').lean();
    const recipient = chat.participants.find(p => p._id.toString() !== req.user._id.toString()) || { _id: 'unknown', name: 'Unknown' };
    io.to(`user_${req.user._id}`).emit('chatUpdate');
    io.to(`user_${recipient._id}`).emit('chatUpdate');
    
    res.json(populatedMessage);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
