const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// Helper to get Call model safely
const getCallModel = (req) => req.app.get('Call') || require('../models/Call');

// POST /api/calls/initiate
router.post('/initiate', auth, async (req, res, next) => {
  try {
    const { recipientId, chatId } = req.body;
    const callerId = req.user.id;
    const Call = getCallModel(req);
    const { Chat } = require('../models/Chat');

    if (!mongoose.Types.ObjectId.isValid(recipientId) || !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid IDs' });
    }

    const chat = await Chat.findById(chatId).populate('participants');
    if (!chat || !chat.participants.some(p => p._id.toString() === recipientId)) {
      return res.status(403).json({ message: 'Invalid chat or recipient' });
    }

    const activeCall = await Call.findOne({
      chatId,
      status: { $in: ['initiated', 'ringing', 'accepted'] }
    });
    if (activeCall) {
      return res.status(409).json({ message: 'Call already in progress' });
    }

    const newCall = new Call({
      caller: callerId,
      recipient: recipientId,
      chatId,
      status: 'initiated'
    });
    await newCall.save();

    const io = req.app.get('io');
    const onlineUserSocket = req.app.get('onlineUsers').get(recipientId);
    if (onlineUserSocket) {
      io.to(onlineUserSocket).emit('incoming-call', {
        callId: newCall._id,
        callerName: req.user.name || 'Unknown',
        chatId
      });
    }

    // Auto-miss after 30s
    setTimeout(async () => {
      try {
        const call = await Call.findById(newCall._id);
        if (call && ['initiated', 'ringing'].includes(call.status)) {
          await Call.findByIdAndUpdate(newCall._id, { status: 'missed' });
          io.emit('call-missed', { callId: newCall._id });
        }
      } catch (err) {
        console.error('Missed call timeout error:', err);
      }
    }, 30000);

    res.status(201).json({ callId: newCall._id });
  } catch (error) {
    next(error);
  }
});

// GET /api/calls/:id — Validate call exists (used by frontend)
router.get('/:id', auth, async (req, res, next) => {
  try {
    const Call = getCallModel(req);
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found' });

    const isParticipant = [call.caller.toString(), call.recipient.toString()].includes(req.user.id);
    if (!isParticipant) return res.status(403).json({ message: 'Unauthorized' });

    res.json({ valid: true, status: call.status });
  } catch (error) {
    next(error);
  }
});

module.exports = router;