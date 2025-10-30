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

// Hoist model requires
let User, Chat, Message;

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
    console.log('Successfully loaded requestRoutes');
} catch (error) {
    console.error('Error loading requestRoutes:', error.message);
}

// Ensure directories
const uploadDir = path.join(__dirname, 'Uploads');
const imagesDir = path.join(__dirname, 'public', 'images');
Promise.all([
    fs.mkdir(uploadDir, { recursive: true }).catch(() => {}),
    fs.mkdir(imagesDir, { recursive: true }).catch(() => {})
]);

// Track socket rooms
const socketRooms = new Map();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:5000', 'https://bazukastore.com'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        credentials: true,
    },
});

app.set('io', io);

// Global Middleware
app.use(cors({
    origin: ['http://localhost:5000', 'https://bazukastore.com'],
    credentials: true,
}));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} | Authorization: ${req.header('Authorization') || 'None'}`);
    next();
});

// Static files
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/admin/static', express.static(path.join(__dirname, 'admin/static')));
app.use(express.static(path.join(__dirname, 'public')));

// Mount /api/requests early
if (requestRoutes) {
    app.use('/api/requests', requestRoutes);
}

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
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

// === SOCKET.IO & DB SETUP ===
connectDB()
    .then(() => {
        const chatModels = require('./models/Chat');
        Chat = chatModels.Chat;
        Message = chatModels.Message;
        User = require('./models/User');
        console.log('DB + Models Ready');

        // Socket Auth
        io.use((socket, next) => {
            const token = socket.handshake.auth.token?.replace('Bearer ', '');
            if (!token) return next(new Error('No token'));
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.user = decoded;
                console.log(`Socket Auth: ${decoded.id}`);
                next();
            } catch (err) {
                next(new Error('Invalid token'));
            }
        });

        io.on('connection', (socket) => {
            console.log(`Connected: ${socket.id} | User: ${socket.user.id}`);
            socketRooms.set(socket.id, new Set());

            // === JOIN USER ROOM ===
            socket.on('joinUser', (callback) => {
                try {
                    const userRoom = `user_${socket.user.id}`;
                    socket.join(userRoom);
                    socketRooms.get(socket.id).add(userRoom);
                    console.log(`Joined: ${userRoom}`);
                    if (typeof callback === 'function') callback();
                } catch (err) {
                    if (typeof callback === 'function') callback({ error: err.message });
                }
            });

            // === JOIN CHAT ROOM ===
            socket.on('joinChat', async ({ chatId }, callback) => {
                try {
                    const chat = await Chat.findById(chatId).populate('participants', '_id');
                    if (!chat || !chat.participants.some(p => p._id.toString() === socket.user.id)) {
                        throw new Error('Unauthorized');
                    }
                    const chatRoom = `chat_${chatId}`;
                    socket.join(chatRoom);
                    socketRooms.get(socket.id).add(chatRoom);
                    console.log(`Joined: ${chatRoom}`);
                    if (typeof callback === 'function') callback();
                } catch (err) {
                    console.error(`joinChat error: ${err.message}`);
                    if (typeof callback === 'function') callback({ error: err.message });
                }
            });

            // === LEAVE CHAT ===
            socket.on('leaveChat', ({ chatId }) => {
                const room = `chat_${chatId}`;
                socket.leave(room);
                socketRooms.get(socket.id)?.delete(room);
                console.log(`Left: ${room}`);
            });

            // === LEAVE USER ===
            socket.on('leaveUser', () => {
                const room = `user_${socket.user.id}`;
                socket.leave(room);
                socketRooms.get(socket.id)?.delete(room);
            });

            // === TYPING ===
            socket.on('typing', async ({ chatId, senderName }) => {
                try {
                    const chat = await Chat.findById(chatId);
                    if (chat?.participants.some(p => p.toString() === socket.user.id)) {
                        socket.to(`chat_${chatId}`).emit('typing', { chatId, senderName });
                    }
                } catch (err) {
                    console.error(`typing error: ${err.message}`);
                }
            });

            // === MESSAGE ===
            socket.on('message', async ({ chatId, message }) => {
                try {
                    const chat = await Chat.findById(chatId);
                    if (chat?.participants.some(p => p.toString() === message.sender._id)) {
                        io.to(`chat_${chatId}`).emit('message', { chatId, message });
                    }
                } catch (err) {
                    console.error(`message error: ${err.message}`);
                }
            });

            // === ADMIN EVENTS ===
            socket.on('joinAdmin', async (token) => {
                try {
                    const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
                    const user = await User.findById(decoded.id);
                    if (user?.isAdmin) {
                        socket.join('adminRoom');
                        socketRooms.get(socket.id).add('adminRoom');
                    }
                } catch (err) {
                    socket.disconnect();
                }
            });

            ['categoryUpdate', 'productUpdate', 'submissionUpdate'].forEach(ev => {
                socket.on(ev, () => io.to('adminRoom').emit(ev));
            });

            socket.on('orderStatusUpdate', (order) => {
                io.to('adminRoom').emit('orderStatusUpdate', order);
                if (order.user) io.to(`user_${order.user}`).emit('orderStatusUpdate', order);
            });

            socket.on('requestUpdate', (data) => io.to('adminRoom').emit('requestUpdate', data));
            socket.on('requestVoteUpdate', (data) => io.to('adminRoom').emit('requestVoteUpdate', data));

            // === DISCONNECT ===
            socket.on('disconnect', () => {
                const rooms = socketRooms.get(socket.id);
                if (rooms) {
                    rooms.forEach(room => {
                        socket.leave(room);
                        if (io.sockets.adapter.rooms.get(room)?.size === 0) {
                            console.log(`Pruned empty room: ${room}`);
                        }
                    });
                    socketRooms.delete(socket.id);
                }
                console.log(`Disconnected: ${socket.id}`);
            });
        });
    })
    .catch(err => {
        console.error('DB failed:', err);
        process.exit(1);
    });

// === VISITOR NOTIFY ===
app.use(async (req, res, next) => {
    if (req.originalUrl.startsWith('/api/locations')) return next();
    next();
    try {
        const visitor = await VisitorLocation.findOne().sort({ timestamp: -1 }).lean();
        if (visitor) io.to('adminRoom').emit('newVisitor', visitor);
    } catch (err) {
        console.error(`Visitor error: ${err.message}`);
    }
});

// === FALLBACKS ===
app.get('/service-worker.js', (req, res) => {
    res.status(404).send('Service worker not found');
});

app.get('/images/:filename', async (req, res) => {
    const filePath = path.join(__dirname, 'public', 'images', req.params.filename);
    try {
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch {
        res.redirect('https://placehold.co/600x400?text=No+Image');
    }
});

// === 404 ===
app.use((req, res) => {
    console.log(`404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: 'Route not found' });
});

// === FRONTEND ===
const serve = (file) => (req, res) => res.sendFile(path.join(__dirname, 'public', file));
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

['sales-orders.html', 'products.html', 'customers.html'].forEach(file => {
    app.get(`/admin/${file}`, auth, (req, res) => {
        if (!req.user?.isAdmin) return res.status(403).json({ message: 'Admin only' });
        res.sendFile(path.join(__dirname, 'admin', file));
    });
});

// === ERROR & START ===
app.use(errorHandler);
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on :${PORT}`));
