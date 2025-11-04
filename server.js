require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const VisitorLocation = require('./models/VisitorLocation');

// DB & Middleware
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const auth = require('./middleware/auth');

// Models (lazy load)
let User, Chat, Message, Call;

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
const uploadRoutes = require('./routes/uploadRoutes');
const callRoutes = require('./routes/callRoutes');

let requestRoutes;
try {
  requestRoutes = require('./routes/requestRoutes');
} catch (err) {
  console.warn('requestRoutes not found:', err.message);
}

let messageRoutes;
try {
  messageRoutes = require('./routes/messageRoutes');
} catch (err) {
  console.warn('messageRoutes not found:', err.message);
}

// Call handler setup
const { setupCallHandlers } = require('./callHandler');
const { setIo } = require('./utils/socket');

// Ensure Upload folders exist
const uploadDir = path.join(__dirname, 'Uploads');
const imagesDir = path.join(__dirname, 'public', 'images');
Promise.all([
  fs.mkdir(uploadDir, { recursive: true }).catch(() => {}),
  fs.mkdir(imagesDir, { recursive: true }).catch(() => {}),
]);

// EXPRESS + SOCKET.IO
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ['http://localhost:5000', 'https://bazukastore.com'], credentials: true },
});
app.set('io', io);
setIo(io);

// Middleware
app.use(cors({ origin: ['http://localhost:5000', 'https://bazukastore.com'], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/Uploads', express.static(uploadDir));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use(express.static(path.join(__dirname, 'public')));

// Optional routes that may not exist
if (requestRoutes) app.use('/api/requests', requestRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', auth, userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/product-submissions', auth, productSubmissionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', auth, orderRoutes);
app.use('/api/chats', auth, chatRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/carts', auth, cartRoutes);
app.use('/api/addresses', auth, addressRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/checkout', auth, checkoutRoutes);
app.use('/api/wishlist', auth, wishlistRoutes);
app.use('/api/visitors', auth, visitorRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/customers', auth, customerRoutes);
app.use('/api/upload', auth, uploadRoutes);
app.use('/api/calls', callRoutes);


// Messages route only if available and exported properly
if (typeof messageRoutes === 'function') {
  app.use('/api/messages', auth, messageRoutes(io));
} else {
  console.warn('⚠ messageRoutes is missing or not a function');
}

// ONLINE USERS
const onlineUsers = new Map();
app.set('onlineUsers', onlineUsers);

// DB + SOCKET
connectDB()
  .then(async () => {
    // Load models
    const chatModels = require('./models/Chat');
    Chat = chatModels.Chat;
    Message = chatModels.Message;
    User = require('./models/User');
    try {
      Call = require('./models/Call');
      console.log('✅ Call model loaded');
      app.set('Call', Call);
    } catch (e) {
      console.warn('Call model load failed:', e.message);
    }

    console.log('✅ Database connected and models loaded');

    // SOCKET AUTH
    io.use((socket, next) => {
      const token = socket.handshake.auth.token?.replace('Bearer ', '');
      if (!token) return next(new Error('No token'));
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = { id: decoded.id, name: decoded.name || 'User' };
        next();
      } catch {
        next(new Error('Invalid token'));
      }
    });

    // SOCKET CONNECTION
    io.on('connection', (socket) => {
      console.log(`[SOCKET] Connected ${socket.id} | User ${socket.user.id}`);
      onlineUsers.set(socket.user.id, socket.id);

      // Setup call handlers
      setupCallHandlers(io, socket, onlineUsers, app);

      const rooms = new Set();

      socket.on('joinChat', async ({ chatId }, cb) => {
        try {
          const chat = await Chat.findById(chatId).populate('participants', '_id');
          if (!chat || !chat.participants.some(p => p._id.toString() === socket.user.id))
            throw new Error('Unauthorized');
          const room = `chat_${chatId}`;
          socket.join(room);
          rooms.add(room);
          cb?.();
        } catch (err) {
          cb?.({ error: err.message });
        }
      });

      socket.on('leaveChat', ({ chatId }) => {
        const room = `chat_${chatId}`;
        socket.leave(room);
        rooms.delete(room);
      });

      socket.on('typing', async ({ chatId, senderName }) => {
        const chat = await Chat.findById(chatId);
        if (chat?.participants.some(p => p.toString() === socket.user.id)) {
          socket.to(`chat_${chatId}`).emit('typing', { chatId, senderName });
        }
      });

      socket.on('disconnect', () => {
        rooms.forEach((r) => socket.leave(r));
        for (let [userId, sid] of onlineUsers.entries()) {
          if (sid === socket.id) onlineUsers.delete(userId);
        }
        console.log(`[SOCKET] Disconnected ${socket.id}`);
      });
    });
  })
  .catch((err) => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });

// VISITOR TRACKING
app.use(async (req, res, next) => {
  next();
  try {
    const v = await VisitorLocation.findOne().sort({ timestamp: -1 }).lean();
    if (v) io.to('adminRoom').emit('newVisitor', v);
  } catch (e) {
    console.error(e);
  }
});

// FALLBACK ROUTES
app.get('/service-worker.js', (_, res) => res.status(404).send('Not found'));
app.get('/images/:filename', async (req, res) => {
  const filePath = path.join(__dirname, 'public', 'images', req.params.filename);
  try {
    await fs.access(filePath);
    res.sendFile(filePath);
  } catch {
    res.redirect('https://placehold.co/600x400?text=No+Image');
  }
});

app.use((_, res) => res.status(404).json({ message: 'Route not found' }));

// FRONTEND ROUTES
const serve = (file) => (_, res) => res.sendFile(path.join(__dirname, 'public', file));
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
['sales-orders.html', 'products.html', 'customers.html'].forEach((f) =>
  app.get(`/admin/${f}`, auth, (req, res) => {
    if (!req.user?.isAdmin) return res.status(403).json({ message: 'Admin only' });
    res.sendFile(path.join(__dirname, 'admin', f));
  })
);

// ERROR HANDLER + START
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
