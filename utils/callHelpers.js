// utils/callHelpers.js
module.exports = {
  findCall: async (CallModel, callId) => await CallModel.findById(callId),
  updateCallStatus: async (CallModel, callId, status) =>
    await CallModel.updateOne({ _id: callId }, { status }),
  getOtherUserId: (call, userId) =>
    userId === call.caller.toString() ? call.recipient.toString() : call.caller.toString(),
  isParticipant: (call, userId) =>
    [call.caller.toString(), call.recipient.toString()].includes(userId),
};
