exports.getChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    const chat = await Chat.findById(chatId)
      .populate('participants', '_id name avatar')
      .lean();

    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const recipient = chat.participants.find(p => p._id.toString() !== userId.toString())
      || { _id: 'support', name: 'Support' };

    const safeMessages = chat.messages.map(msg => {
      let parsedContent = msg.content;
      if (msg.isImage && typeof msg.content === 'string') {
        try {
          parsedContent = JSON.parse(msg.content);
        } catch (e) {
          parsedContent = [msg.content]; // fallback
        }
      }

      return {
        _id: msg._id,
        sender: msg.sender || { _id: 'support', name: 'Support' },
        content: parsedContent,
        isImage: !!msg.isImage,
        createdAt: msg.createdAt || new Date(),
        tempId: msg.tempId,
        replyTo: msg.replyTo,
        readBy: msg.readBy?.map(id => id.toString()) || [],
      };
    });

    res.json({
      _id: chat._id,
      recipient: {
        _id: recipient._id,
        name: recipient.name || 'Support',
        avatar: recipient.avatar || null,
      },
      messages: safeMessages,
      updatedAt: chat.updatedAt,
    });
  } catch (error) {
    console.error('getChat error:', error);
    res.status(500).json({ message: error.message });
  }
};