const express = require('express');
const router = express.Router();
const { Message, Chat } = require('../models/Chat'); // Fixed: Import both models
const auth = require('../middleware/auth');

// POST /api/messages
router.post('/', auth, async (req, res) => {
  try {
    const { chatId, content, isImage, replyTo } = req.body;
    
    // Validation
    if (!chatId || !content) {
      return res.status(400).json({ message: 'chatId and content are required' });
    }

    // Check if chat exists and user is participant
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const userId = req.user._id.toString();
    const isParticipant = chat.participants.some(p => p.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not a participant in this chat' });
    }

    // Create message
    const message = new Message({
      chatId,
      sender: req.user._id,
      content,
      isImage: !!isImage,
      replyTo: replyTo || null,
    });

    await message.save();

    // Update chat lastMessage and timestamp
    const previewText = isImage ? 'Image' : content.length > 50 ? content.substring(0, 47) + '...' : content;
    await Chat.findByIdAndUpdate(chatId, {
      lastMessage: previewText,
      updatedAt: new Date(),
    });

    // Populate message with sender and replyTo details
    await message.populate('sender', '_id name');
    if (replyTo) {
      await message.populate({
        path: 'replyTo',
        select: 'content isImage',
        populate: { path: 'sender', select: 'name' }
      });
    }

    // Emit real-time updates
    const io = req.app.get('io');
    if (io) {
      // Emit to chat room
      const chatRoom = `chat_${chatId}`;
      io.to(chatRoom).emit('message', { chatId, message: message.toObject() });
      
      // Emit chat updates to participants
      chat.participants.forEach(participantId => {
        io.to(`user_${participantId}`).emit('chatUpdate');
      });
      
      console.log(`[${new Date().toISOString()}] Message sent to ${chatRoom}`);
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

module.exports = router;