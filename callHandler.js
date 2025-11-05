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

    // CRITICAL: SEND TO RECEIVER TOO
    if (socket.connected) {
      socket.emit('call-accepted', { callId, answer });
      console.log('[ACCEPT → RECEIVER]');
    } else {
      console.warn('[ACCEPT → RECEIVER] Socket disconnected');
    }

  } catch (err) {
    console.error('[ACCEPT ERROR]', err.message);
  }
});
