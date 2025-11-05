// callHandler.js
// NO require('../models/Call') HERE

const setupCallHandlers = (io, socket, onlineUsers, app) => {
  const CallModel = app.get('Call'); // GET FROM app — safe even if null

  if (!CallModel) {
    console.error('[CALL HANDLER] Call model not loaded yet');
    return;
  }

  // 1. RECEIVE INCOMING CALL PUSH
  socket.on('incoming-call', (data) => {
    socket.emit('incoming-call', data);
    console.log('[INCOMING-CALL] → receiver', data.callId);
  });

  // 2. CALLER → SEND OFFER
  socket.on('call-user', async ({ callId, offer, recipientUserId }) => {
    try {
      const call = await CallModel.findById(callId);
      if (!call || call.status !== 'initiated') return;

      await CallModel.updateOne({ _id: callId }, { status: 'ringing' });

      const recipientSocketId = onlineUsers.get(recipientUserId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('call-offer', { 
          callId, 
          offer, 
          callerId: socket.user.id 
        });
        console.log('[OFFER → RINGING]');
      }
    } catch (err) {
      console.error('[CALL RELAY ERROR]', err);
    }
  });

  // 3. RECEIVER → ACCEPT
  socket.on('accept-call', async ({ callId, answer }) => {
    try {
      const call = await CallModel.findById(callId);
      if (!call || call.status !== 'ringing' || call.recipient.toString() !== socket.user.id) {
        console.log('[ACCEPT REJECTED] Invalid state or user');
        return;
      }

      await CallModel.updateOne(
        { _id: callId },
        { status: 'accepted', startedAt: new Date() }
      );

      const callerSocketId = onlineUsers.get(call.caller.toString());
      if (callerSocketId) {
        io.to(callerSocketId).emit('call-accepted', { callId, answer });
        console.log('[ACCEPT → CALLER]');
      }

      // CRITICAL: SEND TO RECEIVER TOO — WITH DISCONNECT GUARD
      if (socket.connected) {
        socket.emit('call-accepted', { callId, answer });
        console.log('[ACCEPT → RECEIVER]');
      } else {
        console.warn('[ACCEPT → RECEIVER] Socket disconnected — receiver may not transition to active');
      }

    } catch (err) {
      console.error('[ACCEPT ERROR]', err.message);
    }
  });

  // 4. DECLINE / END / ICE
  socket.on('decline-call', async ({ callId }) => {
    try {
      const call = await CallModel.findById(callId);
      if (!call || !['ringing', 'initiated'].includes(call.status)) return;

      await CallModel.updateOne({ _id: callId }, { status: 'rejected' });

      const otherId = socket.user.id === call.recipient.toString() 
        ? call.caller.toString() 
        : call.recipient.toString();
      const otherSocketId = onlineUsers.get(otherId);
      if (otherSocketId) {
        io.to(otherSocketId).emit('call-declined', { callId });
      }
    } catch (err) {
      console.error('[DECLINE ERROR]', err);
    }
  });

  socket.on('end-call', async ({ callId }) => {
    try {
      const call = await CallModel.findById(callId);
      if (!call || call.status === 'ended') return;

      const isParticipant = [call.caller.toString(), call.recipient.toString()].includes(socket.user.id);
      if (!isParticipant) return;

      await CallModel.updateOne({ _id: callId }, { 
        status: 'ended', 
        endedAt: new Date(),
        ...(call.startedAt && { duration: Math.floor((new Date() - call.startedAt) / 1000) })
      });

      const otherId = socket.user.id === call.caller.toString() ? call.recipient.toString() : call.caller.toString();
      const otherSocketId = onlineUsers.get(otherId);
      if (otherSocketId) {
        io.to(otherSocketId).emit('call-ended', { callId });
      }
    } catch (err) {
      console.error('[END ERROR]', err);
    }
  });

  socket.on('ice-candidate', async ({ callId, candidate }) => {
    try {
      const call = await CallModel.findById(callId).select('caller recipient status');
      if (!call || !['ringing', 'accepted'].includes(call.status)) return;

      const isParticipant = [call.caller.toString(), call.recipient.toString()].includes(socket.user.id);
      if (!isParticipant) return;

      const otherId = socket.user.id === call.caller.toString() ? call.recipient.toString() : call.caller.toString();
      const otherSocketId = onlineUsers.get(otherId);
      if (otherSocketId) {
        io.to(otherSocketId).emit('ice-candidate', { callId, candidate });
      }
    } catch (err) {
      console.error('[ICE ERROR]', err);
    }
  });
};

module.exports = { setupCallHandlers };
