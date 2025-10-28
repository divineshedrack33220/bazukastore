require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const VisitorLocation = require('./models/VisitorLocation');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');

// Connect DB
const connectDB = require('./config/db');

// Middleware
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
let requestRoutes;
try {
    requestRoutes = require('./routes/requestRoutes');
    console.log('✅ Successfully loaded requestRoutes');
} catch (error) {
    console.error('❌ Error loading requestRoutes:', error.message);
}

// Ensure directories exist
const uploadDir = path.join(__dirname, 'Uploads');
const imagesDir = path.join(__dirname, 'public', 'images');
Promise.all([
    fs.mkdir(uploadDir, { recursive: true }).catch(err => console.error('Error creating Uploads directory:', err)),
    fs.mkdir(imagesDir, { recursive: true }).catch(err => console.error('Error creating public/images directory:', err))
]);

// Track socket rooms for cleanup
const socketRooms = new Map(); // Map<socket.id, Set<room>>

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:5000', 'https://bazukastore.com'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        credentials: true,
    },
});

// Attach io to app for use in controllers
app.set('io', io);

// Global Middleware
app.use(cors({
    origin: ['http://localhost:5000', 'https://bazukastore.com'],
    credentials: true,
}));

// Log all incoming requests for debugging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} | Authorization: ${req.header('Authorization') || 'None'}`);
    next();
});

// Debug static file requests
app.use('/images', express.static(path.join(__dirname, 'public', 'images'), {
    setHeaders: (res, filePath) => {
        console.log(`Serving static file: ${filePath}`);
    }
}));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/admin/static', express.static(path.join(__dirname, 'admin/static')));
app.use(express.static(path.join(__dirname, 'public')));

// Debug /api/requests specifically
app.use('/api/requests', (req, res, next) => {
    console.log(`[${new Date().toISOString()}] Requests route hit: ${req.method} ${req.originalUrl}`);
    next();
});

// API Routes (Mount /api/requests before body-parsing middleware)
if (requestRoutes) {
    app.use('/api/requests', requestRoutes);
    console.log('✅ Mounted /api/requests route');
} else {
    console.error('❌ /api/requests route not mounted due to import error');
}

// Body-parsing middleware (after /api/requests)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Other API Routes
console.log('✅ Registering API routes');
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
app.use('/api/payments', auth, paymentRoutes);
app.use('/api/checkout', auth, checkoutRoutes);
app.use('/api/wishlist', auth, wishlistRoutes);
app.use('/api/visitors', auth, visitorRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/customers', auth, customerRoutes);
app.use('/api/messages', auth, messageRoutes);
app.use('/api/upload', auth, uploadRoutes);

// Connect to MongoDB
connectDB();

// Socket.IO Authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token?.replace('Bearer ', '');
  if (!token) {
    console.log(`[${new Date().toISOString()}] Socket.IO: No token provided`);
    return next(new Error('Authentication error: No token provided'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    console.log(`[${new Date().toISOString()}] Socket.IO: Auth successful for user ID: ${decoded.id}`);
    next();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Socket.IO Auth error: ${error.message}`);
    return next(new Error('Authentication error: Invalid token'));
  }
});

// WebSocket for real-time updates
io.on('connection', (socket) => {
    console.log(`[${new Date().toISOString()}] WebSocket client connected: ${socket.id}, User ID: ${socket.user?.id}`);
    socketRooms.set(socket.id, new Set());

    socket.on('joinAdmin', async (token) => {
        try {
            const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
            const User = require('./models/User');
            const user = await User.findById(decoded.id);
            if (user && user.isAdmin) {
                socket.join('adminRoom');
                socketRooms.get(socket.id).add('adminRoom');
                console.log(`[${new Date().toISOString()}] Admin ${user.name} joined adminRoom`);
            } else {
                console.log(`[${new Date().toISOString()}] Unauthorized admin socket disconnected`);
                socket.disconnect();
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error in joinAdmin: ${error.message}`);
            socket.disconnect();
        }
    });

    socket.on('joinUser', async ({ token }, callback) => {
        try {
            const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
            const User = require('./models/User');
            const user = await User.findById(decoded.id);
            if (user) {
                const userRoom = `user_${user._id}`;
                socket.join(userRoom);
                socketRooms.get(socket.id).add(userRoom);
                console.log(`[${new Date().toISOString()}] User ${user.name} joined ${userRoom}`);
                callback();
            } else {
                console.log(`[${new Date().toISOString()}] Unauthorized user socket disconnected`);
                callback({ error: 'Invalid token' });
                socket.disconnect();
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error in joinUser: ${error.message}`);
            callback({ error: 'Invalid token' });
            socket.disconnect();
        }
    });

    socket.on('joinChat', async ({ chatId }) => {
        try {
            const Chat = require('./models/Chat');
            const chat = await Chat.findById(chatId);
            if (chat) {
                const chatRoom = `chat-${chatId}`;
                socket.join(chatRoom);
                socketRooms.get(socket.id).add(chatRoom);
                console.log(`[${new Date().toISOString()}] Client ${socket.id} joined ${chatRoom}`);
            } else {
                console.error(`[${new Date().toISOString()}] Chat ${chatId} not found`);
                socket.disconnect();
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error in joinChat: ${error.message}`);
            socket.disconnect();
        }
    });

    socket.on('categoryUpdate', () => {
        io.to('adminRoom').emit('categoryUpdate');
    });

    socket.on('productUpdate', () => {
        io.to('adminRoom').emit('productUpdate');
    });

    socket.on('submissionUpdate', () => {
        io.to('adminRoom').emit('submissionUpdate');
    });

    socket.on('orderStatusUpdate', (order) => {
        io.to('adminRoom').emit('orderStatusUpdate', order);
        if (order.user) {
            io.to(`user_${order.user}`).emit('orderStatusUpdate', order);
        }
    });

    socket.on('requestUpdate', (data) => {
        io.to('adminRoom').emit('requestUpdate', data);
    });

    socket.on('requestVoteUpdate', (data) => {
        io.to('adminRoom').emit('requestVoteUpdate', data);
    });

    socket.on('message', async ({ chatId, message }) => {
        try {
            const Chat = require('./models/Chat');
            const chat = await Chat.findById(chatId).populate('participants', '_id name');
            if (chat) {
                const chatRoom = `chat-${chatId}`;
                io.to(chatRoom).emit('message', { chatId, message });
                console.log(`[${new Date().toISOString()}] Message sent to ${chatRoom}`);
            } else {
                console.error(`[${new Date().toISOString()}] Chat ${chatId} not found`);
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error in message event: ${error.message}`);
        }
    });

    socket.on('typing', async ({ chatId, senderName }) => {
        try {
            const Chat = require('./models/Chat');
            const chat = await Chat.findById(chatId).populate('participants', '_id name');
            if (chat) {
                const chatRoom = `chat-${chatId}`;
                io.to(chatRoom).emit('typing', { chatId, senderName });
                console.log(`[${new Date().toISOString()}] Typing event sent to ${chatRoom}`);
            } else {
                console.error(`[${new Date().toISOString()}] Chat ${chatId} not found`);
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error in typing event: ${error.message}`);
        }
    });

    socket.on('disconnect', () => {
        const rooms = socketRooms.get(socket.id);
        if (rooms) {
            rooms.forEach(room => {
                socket.leave(room);
                console.log(`[${new Date().toISOString()}] Client ${socket.id} left ${room}`);
                if (room !== 'adminRoom' && io.sockets.adapter.rooms.get(room)?.size === 0) {
                    console.log(`[${new Date().toISOString()}] Room ${room} is empty and can be pruned`);
                }
            });
            socketRooms.delete(socket.id);
        }
        console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id}`);
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
        console.error(`[${new Date().toISOString()}] Error fetching visitor location: ${error.message}`);
    }
});

// Fallback for missing images
app.get('/images/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'images', req.params.filename);
    fs.access(filePath)
        .then(() => {
            console.log(`[${new Date().toISOString()}] Serving image: ${filePath}`);
            res.sendFile(filePath);
        })
        .catch(() => {
            console.warn(`[${new Date().toISOString()}] Image not found: ${filePath}`);
            res.redirect(`https://placehold.co/600x400?text=No+Image`);
        });
});

// Debug 404 routes
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] 404: Route not found for ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: 'Route not found' });
});

// Frontend entrypoints
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Error serving index.html: ${err.message}`);
            res.status(404).json({ message: 'index.html not found' });
        }
    });
});

app.get('/categories.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'categories.html'), (err) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Error serving categories.html: ${err.message}`);
            res.status(404).json({ message: 'categories.html not found' });
        }
    });
});

app.get('/orders.html', auth, (req, res) => {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    res.sendFile(path.join(__dirname, 'public', 'orders.html'), (err) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Error serving orders.html: ${err.message}`);
            res.status(404).json({ message: 'orders.html not found' });
        }
    });
});

app.get('/track-order.html', auth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'track-order.html'), (err) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Error serving track-order.html: ${err.message}`);
            res.status(404).json({ message: 'track-order.html not found' });
        }
    });
});

app.get('/request.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'request.html'), (err) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Error serving request.html: ${err.message}`);
            res.status(404).json({ message: 'request.html not found' });
        }
    });
});

app.get('/request-details.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'request-details.html'), (err) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Error serving request-details.html: ${err.message}`);
            res.status(404).json({ message: 'request-details.html not found' });
        }
    });
});

app.get('/admin', auth, (req, res) => {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    res.sendFile(path.join(__dirname, 'admin', 'index.html'), (err) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Error serving admin/index.html: ${err.message}`);
            res.status(404).json({ message: 'Admin dashboard not found' });
        }
    });
});

app.get('/admin/sales-orders.html', auth, (req, res) => {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    res.sendFile(path.join(__dirname, 'admin', 'sales-orders.html'), (err) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Error serving sales-orders.html: ${err.message}`);
            res.status(404).json({ message: 'sales-orders.html not found' });
        }
    });
});

app.get('/admin/products.html', auth, (req, res) => {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    res.sendFile(path.join(__dirname, 'admin', 'products.html'), (err) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Error serving products.html: ${err.message}`);
            res.status(404).json({ message: 'products.html not found' });
        }
    });
});

app.get('/admin/customers.html', auth, (req, res) => {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    res.sendFile(path.join(__dirname, 'admin', 'customers.html'), (err) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Error serving customers.html: ${err.message}`);
            res.status(404).json({ message: 'customers.html not found' });
        }
    });
});

// Global Error Handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
