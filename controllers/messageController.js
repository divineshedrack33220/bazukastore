const Chat = require('../models/Chat');
const cloudinary = require('../config/cloudinary');

exports.createChat = async (req, res) => {
  try {
    const { recipientId } = req.body;
    let chat;

    if (recipientId && require('mongoose').Types.ObjectId.isValid(recipientId)) {
      chat = await Chat.findOne({
        participants: { $all: [recipientId] },
      });
      if (chat) {
        return res.json({ chatId: chat._id });
      }
    }

    chat = new Chat({
      participants: recipientId ? [recipientId] : [],
      messages: [{
        sender: { _id: 'system', name: 'System' },
        content: `Chat started`,
      }],
    });
    await chat.save();

    // Emit WebSocket event for new chat
    const io = req.app.get('io');
    io.to(`chat_${chat._id}`).emit('chatUpdate', chat);
    if (recipientId) {
      io.to(`user_${recipientId}`).emit('chatUpdate', chat);
    }

    res.json({ chatId: chat._id });
  } catch (error) {
    console.error('Error in createChat:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { chatId, content, senderId, senderName, isImage } = req.body;
    const images = req.files?.map(file => ({
      url: file.path,
      public_id: file.filename,
    }));

    if (!require('mongoose').Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const message = {
      sender: { _id: senderId || 'guest_' + Math.random().toString(36).substr(2, 9), name: senderName || 'Guest' },
      content: content || (images ? images[0].url : ''),
      isImage: isImage || !!images,
    };

    if (content) {
      chat.messages.push({ sender: message.sender, content });
    }
    if (images?.length) {
      images.forEach(image => chat.messages.push({ sender: message.sender, content: image.url, isImage: true }));
    }

    await chat.save();

    // Emit WebSocket event for message update
    const io = req.app.get('io');
    io.to(`chat_${chatId}`).emit('message', { chatId, message: chat.messages[chat.messages.length - 1] });

    // Simulate admin response for guest chats
    if (!chat.participants.length || chat.participants.every(p => p.toString() !== senderId)) {
      setTimeout(async () => {
        const adminMessage = {
          sender: { _id: 'admin', name: 'Support' },
          content: content ? 'Thanks for your message! We’re checking on your query.' : `Thanks for sharing ${images?.length > 1 ? 'the images' : 'the image'}! We’ll review and respond soon.`,
        };
        chat.messages.push(adminMessage);
        await chat.save();
        io.to(`chat_${chatId}`).emit('message', { chatId, message: adminMessage });
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
    if (!require('mongoose').Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    const chat = await Chat.findById(chatId)
      .lean();
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    res.json({
      _id: chat._id,
      recipient: chat.participants[0] ? { _id: chat.participants[0]._id, name: chat.participants[0].name || 'Support' } : { _id: 'support', name: 'Support' },
      messages: chat.messages.map(msg => ({
        _id: msg._id,
        sender: msg.sender || { _id: 'support', name: 'Support' },
        content: msg.content,
        isImage: msg.isImage || false,
        createdAt: msg.createdAt || new Date(),
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
    const chats = await Chat.find({})
      .sort({ updatedAt: -1 })
      .lean();

    const modifiedChats = chats.map(chat => {
      const lastMessage = chat.messages[chat.messages.length - 1] || {};
      const recipient = chat.participants[0] || { _id: 'support', name: 'Support' };
      return {
        _id: chat._id,
        recipient: { _id: recipient._id, name: recipient.name || 'Support', avatar: recipient.avatar || null },
        lastMessage: lastMessage.content || (lastMessage.isImage ? 'Image' : ''),
        updatedAt: chat.updatedAt,
      };
    });

    res.json(modifiedChats);
  } catch (error) {
    console.error('Error in getChats:', error);
    res.status(400).json({ message: error.message });
  }
};