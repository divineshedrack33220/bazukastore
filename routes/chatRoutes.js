// routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const { Chat, Message } = require('../models/Chat');
const auth = require('../middleware/auth');

/* GET /api/chats – List of chats */
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

/* GET /api/chats/:chatId – Single chat + messages (from Message collection) */
router.get('/:chatId', auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId)
      .populate('participants', '_id name avatar')   // <-- POPULATE PARTICIPANTS
      .lean();

    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const messages = await Message.find({ chatId: req.params.chatId })
      .populate('sender', '_id name avatar')
      .populate('replyTo', 'content isImage')
      .populate('replyTo.sender', '_id name')
      .sort({ createdAt: 1 })
      .lean();

    const recipient = chat.participants.find(p => p._id.toString() !== req.user._id.toString())
      || { _id: 'unknown', name: 'Unknown' };

    const safeMessages = messages.map(m => ({
      _id: m._id,
      sender: {
        _id: m.sender?._id ?? 'unknown',
        name: m.sender?.name ?? 'Unknown',
        avatar: m.sender?.avatar ?? null,
      },
      content: m.isImage && typeof m.content === 'string' ? JSON.parse(m.content || '[]') : m.content,
      isImage: !!m.isImage,
      createdAt: m.createdAt ?? new Date(),
      readBy: m.readBy?.map(id => id.toString()) ?? [],
      replyTo: m.replyTo ? {
        _id: m.replyTo._id,
        content: m.replyTo.isImage && typeof m.replyTo.content === 'string'
          ? JSON.parse(m.replyTo.content || '[]')
          : m.replyTo.content,
        isImage: !!m.replyTo.isImage,
        sender: {
          _id: m.replyTo.sender?._id ?? 'unknown',
          name: m.replyTo.sender?.name ?? 'Unknown',
        },
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

/* GET /api/chats/:chatId/older – Load older messages */
router.get('/:chatId/older', auth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { before } = req.query;

    const chat = await Chat.findById(chatId).lean();
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.participants.map(p => p.toString()).includes(req.user._id.toString())) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const query = { chatId };
    if (before && /^[0-9a-fA-F]{24}$/.test(before)) {
      query._id = { $lt: before };
    }

    const msgs = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('sender', '_id name avatar')
      .populate('replyTo', 'content isImage')
      .populate('replyTo.sender', '_id name')
      .lean();

    const reversed = msgs.reverse();

    const safe = reversed.map(m => ({
      _id: m._id,
      sender: { _id: m.sender?._id ?? 'unknown', name: m.sender?.name ?? 'Unknown', avatar: m.sender?.avatar ?? null },
      content: m.isImage && typeof m.content === 'string' ? JSON.parse(m.content || '[]') : m.content,
      isImage: !!m.isImage,
      createdAt: m.createdAt ?? new Date(),
      readBy: m.readBy?.map(id => id.toString()) ?? [],
      replyTo: m.replyTo ? {
        _id: m.replyTo._id,
        content: m.replyTo.isImage && typeof m.replyTo.content === 'string'
          ? JSON.parse(m.replyTo.content || '[]')
          : m.replyTo.content,
        isImage: !!m.replyTo.isImage,
        sender: { _id: m.replyTo.sender?._id ?? 'unknown', name: m.replyTo.sender?.name ?? 'Unknown' },
      } : null,
    }));

    res.json({ messages: safe });
  } catch (e) {
    console.error('GET /chats/:id/older error:', e);
    res.status(500).json({ message: e.message });
  }
});

/* POST /api/chats – Create or return existing chat */
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

module.exports = router;