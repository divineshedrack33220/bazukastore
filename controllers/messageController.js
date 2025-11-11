const mongoose = require('mongoose'); // Import once
const Chat = require('../models/Chat');

exports.createChat = async (req, res) => {
  try {
    const { recipientId } = req.body;
    const senderId = req.user._id; // From auth
    let chat;

    if (recipientId && mongoose.Types.ObjectId.isValid(recipientId)) {
      chat = await Chat.findOne({
        participants: { $all: [senderId, recipientId] },
      });
      if (chat) {
        return res.json({ chatId: chat._id });
      }
    }

    const participants = recipientId ? [senderId, recipientId] : [senderId];

    chat = new Chat({
      participants,
      messages: [{
        sender: { _id: 'system', name: 'System' },
        content: `Chat started`,
      }],
    });
    await chat.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`chat_${chat._id}`).emit('chatUpdate', chat);
      if (recipientId) io.to(`user_${recipientId}`).emit('chatUpdate', chat);
      io.to(`user_${senderId}`).emit('chatUpdate', chat);
    }

    res.json({ chatId: chat._id });
  } catch (error) {
    console.error('Error in createChat:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { chatId, content, senderId, senderName, isImage, tempId, replyTo } = req.body; // Handle frontend payload
    const sender = { _id: senderId || 'guest_' + Math.random().toString(36).substr(2, 9), name: senderName || 'Guest' };

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    // Handle Cloudinary URLs (content = text or [urls])
    let messagesToAdd = [];
    if (isImage && Array.isArray(content)) {
      content.forEach(url => {
        messagesToAdd.push({
          sender,
          content: url, // Save Cloudinary URL
          isImage: true,
          tempId, // For frontend swap
          replyTo,
        });
      });
    } else if (content) {
      messagesToAdd.push({
        sender,
        content,
        isImage: !!isImage,
        tempId,
        replyTo,
      });
    }

    if (messagesToAdd.length === 0) {
      return res.status(400).json({ message: 'No content provided' });
    }

    chat.messages.push(...messagesToAdd);
    await chat.save();

    console.log('[MESSAGE] Saved:', messagesToAdd.map(m => typeof m.content === 'string' ? m.content.substring(0, 50) + '...' : '[array]')); // Debug

    const io = req.app.get('io');
    if (io) {
      const lastMessage = chat.messages[chat.messages.length - 1];
      io.to(`chat_${chatId}`).emit('message', { chatId, message: lastMessage });
    }

    // Admin sim (only if not authenticated sender)
    if (!chat.participants.some(p => p.toString() === sender._id)) {
      setTimeout(async () => {
        const adminMessage = {
          sender: { _id: 'admin', name: 'Support' },
          content: isImage 
            ? `Thanks for sharing ${Array.isArray(content) ? 'the images' : 'the image'}! We’ll review and respond soon.`
            : 'Thanks for your message! We’re checking on your query.',
        };
        chat.messages.push(adminMessage);
        await chat.save();
        if (io) io.to(`chat_${chatId}`).emit('message', { chatId, message: adminMessage });
      }, 1500);
    }

    res.json(chat);
  } catch (error) {
    console.error('Error in sendMessage:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.getChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const senderId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const recipient = chat.participants.find(p => p.toString() !== senderId.toString()) || 
                      { _id: 'support', name: 'Support' };

    res.json({
      _id: chat._id,
      recipient: { 
        _id: recipient._id, 
        name: recipient.name || 'Support', 
        avatar: recipient.avatar || null 
      },
      messages: chat.messages.map(msg => ({
        _id: msg._id,
        sender: msg.sender || { _id: 'support', name: 'Support' },
        content: msg.content,
        isImage: msg.isImage || false,
        createdAt: msg.createdAt || new Date(),
        tempId: msg.tempId,
        replyTo: msg.replyTo,
      })),
      updatedAt: chat.updatedAt || new Date(),
    });
  } catch (error) {
    console.error('Error in getChat:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.getChats = async (req, res) => {
  try {
    const senderId = req.user._id;

    const chats = await Chat.find({ participants: senderId })
      .sort({ updatedAt: -1 })
      .lean()
      .limit(50);

    const modifiedChats = chats.map(chat => {
      const lastMessage = chat.messages[chat.messages.length - 1] || {};
      const recipient = chat.participants.find(p => p.toString() !== senderId.toString()) || 
                        { _id: 'support', name: 'Support' };
      return {
        _id: chat._id,
        recipient: { 
          _id: recipient._id, 
          name: recipient.name || 'Support', 
          avatar: recipient.avatar || null 
        },
        lastMessage: lastMessage.content ? 
                     (lastMessage.isImage ? 'Image' : lastMessage.content.substring(0, 50) + '...') : 
                     'No messages yet',
        updatedAt: chat.updatedAt,
      };
    });

    res.json(modifiedChats);
  } catch (error) {
    console.error('Error in getChats:', error);
    res.status(400).json({ message: error.message });
  }
};