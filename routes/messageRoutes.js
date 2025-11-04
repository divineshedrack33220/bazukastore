// routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const { Message, Chat } = require('../models/Chat');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

module.exports = (io) => {
  // POST /api/messages
  router.post('/', auth, async (req, res) => {
    try {
      const { chatId, content, isImage, replyTo, tempId } = req.body;

      if (!chatId || !content) {
        return res.status(400).json({ message: 'chatId and content are required' });
      }

      let finalContent = content;
      let finalIsImage = isImage;
      if (Array.isArray(content)) {
        finalContent = JSON.stringify(content);
        finalIsImage = true;
      } else if (typeof content === 'string') {
        finalIsImage = finalIsImage || /\.(jpg|jpeg|png|gif|webp)$/i.test(content);
      }

      const chat = await Chat.findById(chatId);
      if (!chat) return res.status(404).json({ message: 'Chat not found' });

      const userId = req.user._id.toString();
      const isParticipant = chat.participants.some(p => p.toString() === userId);
      if (!isParticipant) return res.status(403).json({ message: 'Not a participant' });

      const message = new Message({
        chatId,
        sender: req.user._id,
        content: finalContent,
        isImage: finalIsImage,
        replyTo: replyTo ? new mongoose.Types.ObjectId(replyTo) : null,
      });

      await message.save();

      let previewText = finalIsImage 
        ? (Array.isArray(content) ? `${content.length} images` : 'Image')
        : (finalContent.length > 50 ? finalContent.substring(0, 47) + '...' : finalContent);

      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: previewText,
        updatedAt: new Date(),
      });

      try {
        await message.populate('sender', '_id name');
        if (replyTo) {
          await message.populate({
            path: 'replyTo',
            select: 'content isImage',
            populate: { path: 'sender', select: 'name' }
          });
        }
      } catch (e) {
        console.warn('Populate failed:', e.message);
      }

      const payload = { chatId, message: message.toObject() };

      // Emit to chat room
      io.to(`chat_${chatId}`).emit('message', payload);

      // Emit chat update to all participants
      chat.participants.forEach(p => {
        io.to(`user_${p}`).emit('chatUpdate');
      });

      res.status(201).json(message);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ message: 'Failed to send message', error: error.message });
    }
  });

  // GET /api/messages/:chatId - Load chat history
  router.get('/:chatId', auth, async (req, res) => {
    try {
      const { chatId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        return res.status(400).json({ message: 'Invalid chat ID' });
      }

      const chat = await Chat.findById(chatId).populate('participants', '_id name avatar');
      if (!chat) return res.status(404).json({ message: 'Chat not found' });

      await Chat.populate(chat, { path: 'messages.sender', select: '_id name avatar' });
      await Chat.populate(chat, { path: 'messages.replyTo.sender', select: 'name' });

      res.json(chat);
    } catch (error) {
      console.error('Error in getChat:', error);
      res.status(500).json({ message: 'Failed to load chat' });
    }
  });

  // GET /api/messages - List all chats
  router.get('/', auth, async (req, res) => {
    try {
      const userId = req.user._id;
      const chats = await Chat.find({ participants: userId })
        .populate('participants', '_id name avatar')
        .sort({ updatedAt: -1 });

      const formattedChats = chats.map(chat => ({
        _id: chat._id,
        participants: chat.participants.filter(p => p._id.toString() !== userId.toString()),
        messages: chat.messages.slice(-1),
        updatedAt: chat.updatedAt
      }));

      res.json(formattedChats);
    } catch (error) {
      console.error('Error in getChats:', error);
      res.status(500).json({ message: 'Failed to load chats' });
    }
  });

  return router;
};