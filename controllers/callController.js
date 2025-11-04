// controllers/callController.js
const { v4: uuidv4 } = require('uuid');

exports.initiateCall = async (req, res) => {
  try {
    const { recipientId: recipientUserId, chatId } = req.body;
    const callerId = req.user._id.toString();

    if (!recipientUserId || !chatId) {
      return res.status(400).json({ message: 'recipientId and chatId are required' });
    }

    if (recipientUserId === callerId) {
      return res.status(400).json({ message: 'Cannot call yourself' });
    }

    // Prevent duplicate active calls
    const existingCall = Object.entries(global.activeCalls || {}).find(
      ([_, call]) =>
        call.chatId === chatId &&
        [call.callerId, call.recipientUserId].includes(callerId) &&
        call.status === 'ringing'
    );

    if (existingCall) {
      return res.status(400).json({
        message: 'Active call already exists',
        callId: existingCall[0],
      });
    }

    const callId = uuidv4();

    global.activeCalls = global.activeCalls || {};
    global.activeCalls[callId] = {
      callerId,
      recipientUserId,
      chatId,
      status: 'ringing',
      createdAt: new Date(),
    };

    const io = req.app.get('io');
    io.to(recipientUserId).emit('incoming-call', {
      callId,
      callerId,
      callerName: req.user.name,
      chatId,
      offer: null,
    });

    res.json({ callId, message: 'Call initiated' });
  } catch (error) {
    console.error('initiateCall error:', error);
    res.status(500).json({ message: error.message });
  }
};