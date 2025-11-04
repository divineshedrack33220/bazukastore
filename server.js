require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const VisitorLocation = require('./models/VisitorLocation');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// DB & Models
const connectDB = require('./config/db');
let User, Chat, Message, Call;

const errorHandler = require('./middleware/errorHandler');
const auth = require('./middleware/auth');

// Routes
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const productSubmissionRoutes = require('./routes/productSubmissionRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const chatRoutes = require('./routes/chatRoutes');
const publicRoutes = require('./routes/publicRoutes');
const cartRoutes = require('./routes/cartRoutes');
const authRoutes = require('./routes/authRoutes');
const addressRoutes = require('./routes/addressRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const checkoutRoutes = require('./routes/checkoutRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
const adRoutes = require('./routes/adRoutes');
const locationRoutes = require('./routes/locationRoutes');
const customerRoutes = require('./routes/customerRoutes');
const messageRoutes = require('./routes/messageRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const callRoutes = require('./routes/callRoutes');
let requestRoutes;
try { requestRoutes = require('./routes/requestRoutes'); } catch (e) { console.error(e); }

// CALL HANDLER
const { setupCallHandlers } = require('./callHandler');
const { setIo } = require('./utils/socket');

// Ensure dirs
const uploadDir = path.join(__dirname, 'Uploads');
const imagesDir = path.join(__dirname, 'public', 'images');
Promise.all([
  fs.mkdir(uploadDir, { recursive: true }).catch(() => {}),
  fs.mkdir(imagesDir, { recursive: true }).catch(() => {})
]);

// EXPRESS
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ['http://localhost:5000', 'https://bazukastore.com'], credentials: true },
});
app.set('io', io);
setIo(io);

// MIDDLEWARE
app.use(cors({ origin: ['http://localhost:5000', 'https://bazukastore.com'], credentials: true }));
app.use((req, _, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Static
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/admin/static', express.static(path.join(__dirname, 'admin/static')));
app.use(express.static(path.join(__dirname, 'public')));

// Early request routes
if (requestRoutes) app.use('/api/requests', requestRoutes);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API ROUTES
app.use('/api/users', auth, userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/product-submissions', auth, productSubmissionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', auth, orderRoutes);
app.use('/api/chats', auth, chatRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/carts', auth, cartRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/addresses', auth, addressRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/checkout', auth, checkoutRoutes);
app.use('/api/wishlist', auth, wishlistRoutes);
app.use('/api/visitors', auth, visitorRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/customers', auth, customerRoutes);
app.use('/api/messages', auth, messageRoutes(io));  // PASS io HERE
app.use('/api/upload', auth, uploadRoutes);
app.use('/api/calls', auth, callRoutes);

// DB + SOCKET
const onlineUsers = new Map();
app.set('onlineUsers', onlineUsers);

connectDB()
  .then(async () => {
    const chatModels = require('./models/Chat');
    Chat = chatModels.Chat;
    Message = chatModels.Message;
    User = require('./models/User');

    try {
      Call = require('./models/Call');
      console.log('Call model loaded successfully');
      app.set('Call', Call);
    } catch (e) {
      console.error('Call model load failed:', e);
      Call = null;
    }

    // ONE-TIME DB CLEANUP (DEV ONLY)
    if (process.env.NODE_ENV === 'development' && Call) {
      console.log('Running one-time DB cleanup for calls collection...');
      try {
        await Call.collection.dropIndex('callId_1').catch(err => {
          if (!err.message.includes('index not found')) throw err;
          console.log('callId_1 index already gone');
        });

        const unsetResult = await Call.updateMany({}, { $unset: { callId: '' } });
        console.log(`Removed callId from ${unsetResult.modifiedCount} documents`);

        const deleteResult = await Call.deleteMany({});
        console.log(`Deleted ${deleteResult.deletedCount} call documents`);

        console.log('DB cleanup completed');
      } catch (err) {
        console.error('DB cleanup failed:', err);
      }
    }

    console.log('DB + Models Ready');

    // SOCKET AUTH
    io.use((socket, next) => {
      const token = socket.handshake.auth.token?.replace('Bearer ', '');
      if (!token) return next(new Error('No token'));
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = { id: decoded.id, name: decoded.name || 'User' };
        next();
      } catch (e) { next(new Error('Invalid token')); }
    });

    // SOCKET CONNECTION
    io.on('connection', (socket) => {
      console.log(`[SOCKET] Connected ${socket.id} | User ${socket.user.id}`);
      onlineUsers.set(socket.user.id, socket.id);

      // CALL HANDLERS
      setupCallHandlers(io, socket, onlineUsers, app);

      const rooms = new Set();

      socket.on('joinChat', async ({ chatId }, cb) => {
        try {
          const chat = await Chat.findById(chatId).populate('participants', '_id');
          if (!chat || !chat.participants.some(p => p._id.toString() === socket.user.id))
            throw new Error('Unauthorized');
          const r = `chat_${chatId}`;
          socket.join(r); rooms.add(r);
          if (cb) cb();
        } catch (e) { if (cb) cb({ error: e.message }); }
      });

      socket.on('leaveChat', ({ chatId }) => {
        const r = `chat_${chatId}`;
        socket.leave(r); rooms.delete(r);
      });

      socket.on('typing', async ({ chatId, senderName }) => {
        const chat = await Chat.findById(chatId);
        if (chat?.participants.some(p => p.toString() === socket.user.id))
          socket.to(`chat_${chatId}`).emit('typing', { chatId, senderName });
      });

      // REMOVED DUPLICATE 'message' HANDLER — NOW IN messageRoutes(io)

      socket.on('joinAdmin', async (token) => {
        try {
          const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
          const u = await User.findById(decoded.id);
          if (u?.isAdmin) { socket.join('adminRoom'); rooms.add('adminRoom'); }
        } catch { socket.disconnect(); }
      });

      ['categoryUpdate', 'productUpdate', 'submissionUpdate'].forEach(ev => {
        socket.on(ev, () => io.to('adminRoom').emit(ev));
      });

      socket.on('orderStatusUpdate', (order) => {
        io.to('adminRoom').emit('orderStatusUpdate', order);
        if (order.user) io.to(`user_${order.user}`).emit('orderStatusUpdate', order);
      });

      socket.on('requestUpdate', d => io.to('adminRoom').emit('requestUpdate', d));
      socket.on('requestVoteUpdate', d => io.to('adminRoom').emit('requestVoteUpdate', d));

      socket.on('disconnect', () => {
        rooms.forEach(r => socket.leave(r));
        for (let [userId, sid] of onlineUsers.entries()) {
          if (sid === socket.id) onlineUsers.delete(userId);
        }
        console.log(`[SOCKET] Disconnected ${socket.id}`);
      });
    });
  })
  .catch(err => {
    console.error('DB failed:', err);
    process.exit(1);
  });

// VISITOR NOTIFY
app.use(async (req, res, next) => {
  if (req.originalUrl.startsWith('/api/locations')) return next();
  next();
  try {
    const v = await VisitorLocation.findOne().sort({ timestamp: -1 }).lean();
    if (v) io.to('adminRoom').emit('newVisitor', v);
  } catch (e) { console.error(e); }
});

// FALLBACKS
app.get('/service-worker.js', (_, res) => res.status(404).send('Not found'));
app.get('/images/:filename', async (req, res) => {
  const p = path.join(__dirname, 'public', 'images', req.params.filename);
  try { await fs.access(p); res.sendFile(p); }
  catch { res.redirect('https://placehold.co/600x400?text=No+Image'); }
});

app.use((_, res) => res.status(404).json({ message: 'Route not found' }));

// FRONTEND
const serve = file => (_, res) => res.sendFile(path.join(__dirname, 'public', file));
app.get('/', serve('index.html'));
app.get('/categories.html', serve('categories.html'));
app.get('/track-order.html', auth, serve('track-order.html'));
app.get('/request.html', serve('request.html'));
app.get('/request-details.html', serve('request-details.html'));

app.get('/orders.html', auth, (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ message: 'Admin only' });
  res.sendFile(path.join(__dirname, 'public', 'orders.html'));
});

app.get('/admin', auth, (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ message: 'Admin only' });
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});
['sales-orders.html', 'products.html', 'customers.html'].forEach(f =>
  app.get(`/admin/${f}`, auth, (req, res) => {
    if (!req.user?.isAdmin) return res.status(403).json({ message: 'Admin only' });
    res.sendFile(path.join(__dirname, 'admin', f));
  })
);

// ERROR & START
app.use(errorHandler);
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on :${PORT}`));