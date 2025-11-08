// controllers/chatController.js
const { Chat, Message } = require('../models/Chat');
const auth = require('../middleware/auth');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const callController = require('./callController');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage() });

module.exports = (io) => {
  const router = require('express').Router();

  // GET /api/chats – List of chats
  router.get('/', auth, async (req, res) => {
    try {
      const chats = await Chat.find({ participants: req.user._id })
        .populate('participants', '_id name avatar')
        .sort({ updatedAt: -1 })
        .lean();

      const list = chats.map(chat => {
        const recipient = chat.participants.find(p => p._id.toString() !== req.user._id.toString())
          || { _id: 'unknown', name: 'Unknown' };

        return {
          _id: chat._id,
          recipient: {
            _id: recipient._id,
            name: recipient.name ?? 'Unknown',
            avatar: recipient.avatar ?? null,
          },
          lastMessage: chat.lastMessage ?? 'No messages',
          updatedAt: chat.updatedAt ?? new Date(),
        };
      });

      res.json(list);
    } catch (e) {
      console.error('GET /chats error:', e);
      res.status(500).json({ message: e.message });
    }
  });

  // GET /api/chats/:chatId – Single chat + messages
  router.get('/:chatId', auth, async (req, res) => {
    try {
      const chat = await Chat.findById(req.params.chatId)
        .populate('participants', '_id name avatar')
        .lean();

      if (!chat) return res.status(404).json({ message: 'Chat not found' });

      const messages = await Message.find({ chatId: req.params.chatId })
        .populate('sender', '_id name')
        .populate('replyTo', 'content isImage sender')
        .populate('replyTo.sender', '_id name')
        .lean();

      const recipient = chat.participants.find(p => p._id.toString() !== req.user._id.toString())
        || { _id: 'unknown', name: 'Unknown' };

      const safeMessages = messages.map(m => ({
        _id: m._id,
        sender: { _id: m.sender?._id ?? 'unknown', name: m.sender?.name ?? 'Unknown' },
        content: m.content ?? '',
        isImage: !!m.isImage,
        createdAt: m.createdAt ?? new Date(),
        readBy: m.readBy?.map(id => id.toString()) ?? [],
        replyTo: m.replyTo ? {
          _id: m.replyTo._id,
          content: m.replyTo.content ?? '',
          isImage: !!m.replyTo.isImage,
          sender: { _id: m.replyTo.sender?._id ?? 'unknown', name: m.replyTo.sender?.name ?? 'Unknown' },
        } : null,
      }));

      res.json({
        _id: chat._id,
        recipient: {
          _id: recipient._id,
          name: recipient.name ?? 'Unknown',
          avatar: recipient.avatar ?? null,
        },
        messages: safeMessages,
        updatedAt: chat.updatedAt ?? new Date(),
      });
    } catch (e) {
      console.error('GET /chats/:id error:', e);
      res.status(500).json({ message: e.message });
    }
  });

  // GET /api/chats/:chatId/older – Load older messages
  router.get('/:chatId/older', auth, async (req, res) => {
    try {
      const { chatId } = req.params;
      const { before } = req.query;

      const chat = await Chat.findById(chatId);
      if (!chat) return res.status(404).json({ message: 'Chat not found' });
      if (!chat.participants.map(id => id.toString()).includes(req.user._id.toString())) {
        return res.status(403).json({ message: 'Unauthorized' });
      }

      const query = { chatId };
      if (before && /^[0-9a-fA-F]{24}$/.test(before)) {
        query._id = { $lt: before };
      }

      const messages = await Message.find(query)
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('sender', '_id name')
        .populate('replyTo', 'content isImage sender')
        .populate('replyTo.sender', '_id name')
        .lean();

      const reversed = messages.reverse();

      const safeMessages = reversed.map(m => ({
        _id: m._id,
        sender: { _id: m.sender?._id ?? 'unknown', name: m.sender?.name ?? 'Unknown' },
        content: m.content ?? '',
        isImage: !!m.isImage,
        createdAt: m.createdAt ?? new Date(),
        readBy: m.readBy?.map(id => id.toString()) ?? [],
        replyTo: m.replyTo ? {
          _id: m.replyTo._id,
          content: m.replyTo.content ?? '',
          isImage: !!m.replyTo.isImage,
          sender: { _id: m.replyTo.sender?._id ?? 'unknown', name: m.replyTo.sender?.name ?? 'Unknown' },
        } : null,
      }));

      res.json({ messages: safeMessages });
    } catch (e) {
      console.error('GET /chats/:id/older error:', e);
      res.status(500).json({ message: e.message });
    }
  });

  // POST /api/chats – Create or return existing chat
  router.post('/', auth, async (req, res) => {
    try {
      const { participantId } = req.body;
      if (!participantId) return res.status(400).json({ message: 'participantId required' });

      const existing = await Chat.findOne({
        participants: { $all: [req.user._id, participantId] },
      }).populate('participants', '_id name avatar');

      if (existing) return res.json(existing);

      const chat = new Chat({
        participants: [req.user._id, participantId],
        lastMessage: '',
        updatedAt: new Date(),
      });
      await chat.save();
      await chat.populate('participants', '_id name avatar');
      res.json(chat);
    } catch (e) {
      console.error('POST /chats error:', e);
      res.status(500).json({ message: e.message });
    }
  });

  // POST /api/upload – Image upload
  router.post('/upload', auth, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'chat_images', resource_type: 'image' },
          (error, result) => error ? reject(error) : resolve(result)
        );
        stream.end(req.file.buffer);
      });

      res.json({ url: result.secure_url });
    } catch (e) {
      console.error('Upload error:', e);
      res.status(500).json({ message: 'Upload failed' });
    }
  });

  // POST /api/calls/initiate
  router.post('/calls/initiate', auth, callController.initiateCall);

  // POST /api/messages – Send message (real-time)
  router.post('/messages', auth, async (req, res) => {
    try {
      const { chatId, content, isImage = false, replyTo, tempId } = req.body;
      if (!chatId || (!content && !isImage))
        return res.status(400).json({ message: 'chatId and content required' });

      const chat = await Chat.findById(chatId);
      if (!chat) return res.status(404).json({ message: 'Chat not found' });

      const message = new Message({
        chatId,
        sender: req.user._id,
        content: content ?? '',
        isImage,
        replyTo: replyTo ?? null,
        createdAt: new Date(),
        readBy: [req.user._id],
      });
      await message.save();

      await message.populate('sender', '_id name');
      if (replyTo) await message.populate('replyTo', 'content isImage');
      if (replyTo) await message.populate('replyTo.sender', '_id name');

      chat.lastMessage = isImage ? '[Image]' : (content?.slice(0, 50) || 'No message');
      chat.updatedAt = new Date();
      await chat.save();

      const payload = {
        chatId,
        message: {
          _id: message._id,
          tempId,
          sender: { _id: message.sender._id, name: message.sender.name },
          content: message.content,
          isImage: message.isImage,
          createdAt: message.createdAt,
          readBy: message.readBy.map(id => id.toString()),
          replyTo: message.replyTo
            ? {
                _id: message.replyTo._id,
                content: message.replyTo.content,
                isImage: message.replyTo.isImage,
                sender: {
                  _id: message.replyTo.sender?._id ?? 'unknown',
                  name: message.replyTo.sender?.name ?? 'Unknown',
                },
              }
            : null,
        },
      };

      chat.participants.forEach(p => {
        if (p.toString() !== req.user._id.toString()) {
          io.to(p.toString()).emit('message', payload);
        }
      });

      res.json(payload.message);
    } catch (e) {
      console.error('POST /messages error:', e);
      res.status(500).json({ message: e.message });
    }
  });

  // PATCH /api/messages/:id/read – Mark as read
  router.patch('/messages/:id/read', auth, async (req, res) => {
    try {
      const message = await Message.findById(req.params.id);
      if (!message) return res.status(404).json({ message: 'Message not found' });

      if (!message.readBy.includes(req.user._id)) {
        message.readBy.push(req.user._id);
        await message.save();
      }

      const chat = await Chat.findById(message.chatId);
      const payload = {
        chatId: message.chatId,
        messageId: message._id,
        readBy: message.readBy.map(id => id.toString()),
      };

      chat.participants.forEach(p => {
        io.to(p.toString()).emit('messageRead', payload);
      });

      res.json({ success: true });
    } catch (e) {
      console.error('PATCH /read error:', e);
      res.status(500).json({ message: e.message });
    }
  });

  return router;
};