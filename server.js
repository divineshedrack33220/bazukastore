require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const VisitorLocation = require('./models/VisitorLocation');

// Connect DB
const connectDB = require('./config/db');

// Middleware
const errorHandler = require('./middleware/errorHandler');
const auth = require('./middleware/auth');

// Routes
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'https://bazukastore.onrender.com', // Use env variable or Render URL
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
});

// Attach io to app for use in controllers
app.set('io', io);

// Global Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://bazukastore.onrender.com', // Dynamic CORS origin
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Static files
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/admin/static', express.static(path.join(__dirname, 'admin/static')));
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
connectDB();

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log('WebSocket client connected:', socket.id);
  socket.on('joinAdmin', async (token) => {
    try {
      const decoded = require('jsonwebtoken').verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
      const User = require('./models/User');
      const user = await User.findById(decoded.id);
      if (user && user.isAdmin) {
        socket.join('adminRoom');
        console.log(`Admin ${user.name} joined adminRoom`);
      } else {
        socket.disconnect();
        console.log('Unauthorized admin socket disconnected');
      }
    } catch (error) {
      console.error('Error in joinAdmin:', error.message);
      socket.disconnect();
    }
  });
  socket.on('joinUser', async ({ token }) => {
    try {
      const decoded = require('jsonwebtoken').verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
      const User = require('./models/User');
      const user = await User.findById(decoded.id);
      if (user) {
        socket.join(`user_${user._id}`);
        console.log(`User ${user.name} joined user_${user._id}`);
      } else {
        socket.disconnect();
        console.log('Unauthorized user socket disconnected');
      }
    } catch (error) {
      console.error('Error in joinUser:', error.message);
      socket.disconnect();
    }
  });
  socket.on('categoryUpdate', () => {
    io.to('adminRoom').emit('categoryUpdate');
  });
  socket.on('productUpdate', () => {
    io.to('adminRoom').emit('productUpdate');
  });
  socket.on('orderStatusUpdate', (order) => {
    io.to('adminRoom').emit('orderStatusUpdate', order);
    if (order.user) {
      io.to(`user_${order.user}`).emit('orderStatusUpdate', order);
    }
  });
});

// Notify admins of new visitor
app.use(async (req, res, next) => {
  if (req.originalUrl.startsWith('/api/locations')) return next();
  next();
  try {
    const visitor = await VisitorLocation.findOne().sort({ timestamp: -1 }).lean();
    if (visitor) {
      io.to('adminRoom').emit('newVisitor', visitor);
    }
  } catch (error) {
    console.error('Error fetching visitor location:', error.message);
  }
});

// API Routes
console.log('✅ Registering API routes');
console.log('✅ productRoutes loaded:', productRoutes.stack.map(r => `${r.route.path} (${r.route.stack[0].method})`));
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/carts', cartRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/customers', customerRoutes);

// Debug 404 routes
app.use((req, res, next) => {
  console.log(`404: Route not found for ${req.method} ${req.originalUrl}`);
  res.status(404).send('Route not found');
});

// Frontend entrypoints
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) {
      console.error(`Error serving index.html: ${err.message}`);
      res.status(404).send('index.html not found');
    }
  });
});

app.get('/categories.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'categories.html'), (err) => {
    if (err) {
      console.error(`Error serving categories.html: ${err.message}`);
      res.status(404).send('categories.html not found');
    }
  });
});

app.get('/orders.html', auth, (req, res) => {
  if (!req.user?.isAdmin) {
    return res.status(403).send('Admin access required');
  }
  res.sendFile(path.join(__dirname, 'public', 'orders.html'), (err) => {
    if (err) {
      console.error(`Error serving orders.html: ${err.message}`);
      res.status(404).send('orders.html not found');
    }
  });
});

app.get('/track-order.html', auth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'track-order.html'), (err) => {
    if (err) {
      console.error(`Error serving track-order.html: ${err.message}`);
      res.status(404).send('track-order.html not found');
    }
  });
});

app.get('/admin', auth, (req, res) => {
  if (!req.user?.isAdmin) {
    return res.status(403).send('Admin access required');
  }
  res.sendFile(path.join(__dirname, 'admin', 'index.html'), (err) => {
    if (err) {
      console.error(`Error serving admin/index.html: ${err.message}`);
      res.status(404).send('Admin dashboard not found');
    }
  });
});

app.get('/admin/sales-orders.html', auth, (req, res) => {
  if (!req.user?.isAdmin) {
    return res.status(403).send('Admin access required');
  }
  res.sendFile(path.join(__dirname, 'admin', 'sales-orders.html'), (err) => {
    if (err) {
      console.error(`Error serving sales-orders.html: ${err.message}`);
      res.status(404).send('sales-orders.html not found');
    }
  });
});

app.get('/admin/products.html', auth, (req, res) => {
  if (!req.user?.isAdmin) {
    return res.status(403).send('Admin access required');
  }
  res.sendFile(path.join(__dirname, 'admin', 'products.html'), (err) => {
    if (err) {
      console.error(`Error serving products.html: ${err.message}`);
      res.status(404).send('products.html not found');
    }
  });
});

app.get('/admin/customers.html', auth, (req, res) => {
  if (!req.user?.isAdmin) {
    return res.status(403).send('Admin access required');
  }
  res.sendFile(path.join(__dirname, 'admin', 'customers.html'), (err) => {
    if (err) {
      console.error(`Error serving customers.html: ${err.message}`);
      res.status(404).send('customers.html not found');
    }
  });
});

// Global Error Handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
