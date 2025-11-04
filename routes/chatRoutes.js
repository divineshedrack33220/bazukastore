const express = require('express');
const router = express.Router();
const { Chat, Message } = require('../models/Chat');
const auth = require('../middleware/auth');

// GET /api/chats - Fetch all chats for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.user._id })
      .populate('participants', '_id name')
      .sort({ updatedAt: -1 })
      .lean();
    
    const chatList = chats.map(chat => {
      // Determine recipient (exclude current user)
      const recipient = chat.participants.find(p => p._id.toString() !== req.user._id.toString()) || { _id: 'unknown', name: 'Unknown' };
      return {
        _id: chat._id,
        recipient: {
          name: recipient.name || 'Unknown',
          avatar: recipient.avatar || null, // Adjust if User model has an avatar field
        },
        lastMessage: chat.lastMessage || 'No messages',
        updatedAt: chat.updatedAt || new Date(),
      };
    });
    
    res.json(chatList);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET /api/chats/:chatId - Fetch a single chat
router.get('/:chatId', auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId)
      .populate('participants', '_id name')
      .lean();
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    const messages = await Message.find({ chatId: req.params.chatId })
      .populate('sender', '_id name')
      .lean();
    // Determine recipient (exclude current user)
    const recipient = chat.participants.find(p => p._id.toString() !== req.user._id.toString()) || { _id: 'unknown', name: 'Unknown' };
    res.json({
      _id: chat._id,
      recipient: {
        _id: recipient._id,
        name: recipient.name || 'Unknown',
        avatar: recipient.avatar || null, // Adjust if User model has an avatar field
      },
      messages: messages.map(msg => ({
        _id: msg._id,
        sender: msg.sender || { _id: 'unknown', name: 'Unknown' },
        content: msg.content,
        isImage: msg.isImage || false,
        createdAt: msg.createdAt || new Date(),
      })),
      updatedAt: chat.updatedAt || new Date(),
    });
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ message: error.message });
  }
});

// POST /api/chats - Create a new chat
router.post('/', auth, async (req, res) => {
  try {
    const { participantId } = req.body;
    if (!participantId) {
      return res.status(400).json({ message: 'participantId is required' });
    }
    const existingChat = await Chat.findOne({
      participants: { $all: [req.user._id, participantId] },
    });
    if (existingChat) {
      return res.json(existingChat);
    }
    const chat = new Chat({
      participants: [req.user._id, participantId],
      lastMessage: '',
      updatedAt: new Date(),
    });
    await chat.save();
    await chat.populate('participants', '_id name');
    res.json(chat);
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
