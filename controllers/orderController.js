const Order = require('../models/Order');
const User = require('../models/User');
const { Parser } = require('json2csv');
const { createNotification } = require('./notificationController');
const cloudinary = require('../utils/cloudinary');

exports.uploadPaymentProof = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload_stream(
      {
        folder: 'payment-proofs',
        resource_type: 'auto', // Supports images and PDFs
      },
      (error, result) => {
        if (error) {
          throw new Error(`Cloudinary upload failed: ${error.message}`);
        }
        return result;
      }
    ).end(req.file.buffer);

    res.status(200).json({ url: result.secure_url });
  } catch (error) {
    console.error('Error uploading payment proof:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod, orderNotes, paymentProof } = req.body;
    const user = req.user;

    // Fetch cart items
    const cartResponse = await fetch(`${process.env.API_BASE_URL}/cart`, {
      headers: { 'Authorization': `Bearer ${req.headers.authorization.split(' ')[1]}` },
    });
    if (!cartResponse.ok) {
      throw new Error('Failed to fetch cart');
    }
    const cart = await cartResponse.json();

    const items = cart.map(item => ({
      product: item.product._id,
      quantity: item.quantity,
      price: item.product.price,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const deliveryFee = 5000;
    const total = subtotal + deliveryFee;

    const order = new Order({
      user: user._id,
      addressId,
      items,
      subtotal,
      deliveryFee,
      total,
      paymentMethod,
      paymentProof,
      orderNotes,
      tracking: [{ status: 'Placed' }],
      paymentStatus: paymentMethod === 'Bank Transfer' ? 'pending' : 'completed',
    });

    await order.save();
    user.cart = [];
    await user.save();

    // Emit WebSocket event for new order
    req.app.get('io').to('adminRoom').emit('newOrder', {
      _id: order._id,
      orderNumber: order.orderNumber,
      user: { name: user.name },
      total: order.total,
      status: order.status,
      paymentProof: order.paymentProof,
      createdAt: order.createdAt,
    });
    req.app.get('io').to(`user_${user._id}`).emit('orderStatusUpdate', order);

    res.status(201).json(order);
  } catch (error) {
    console.error('Error in createOrder:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, count, period } = req.query;
    const query = req.user.isAdmin ? {} : { user: req.user._id };
    if (status) query.status = status;
    if (period) {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      query.createdAt = { $gte: startDate };
    }

    if (count) {
      const totalOrders = await Order.countDocuments(query);
      return res.json({ count: totalOrders });
    }

    const orders = await Order.find(query)
      .populate('items.product user')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Error in getOrders:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.product user');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!req.user.isAdmin && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error in getOrder:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const { status } = req.body;
    const order = await Order.findById(req.params.id).populate('user');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.status = status;
    order.tracking.push({ status });
    await order.save();

    if (status === 'Packed') {
      await createNotification(
        order.user._id,
        `Your order #${order.orderNumber} is ready for delivery or pickup!`,
        'order'
      );
    }

    // Emit WebSocket event for status update
    req.app.get('io').to('adminRoom').emit('orderStatusUpdate', order);
    req.app.get('io').to(`user_${order.user._id}`).emit('orderStatusUpdate', order);

    res.json(order);
  } catch (error) {
    console.error('Error in updateOrderStatus:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.getSalesMetrics = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const orders = await Order.find({}).select('total');
    const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
    const avgOrderValue = orders.length ? Math.round(totalSales / orders.length) : 0;

    res.json({ totalSales, avgOrderValue });
  } catch (error) {
    console.error('Error in getSalesMetrics:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.exportOrders = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate('user', 'name email')
      .lean();
    const fields = [
      { label: 'Order Number', value: 'orderNumber' },
      { label: 'Customer Name', value: 'user.name' },
      { label: 'Customer Email', value: 'user.email' },
      { label: 'Total', value: 'total' },
      { label: 'Status', value: 'status' },
      { label: 'Date', value: 'createdAt' },
    ];
    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(orders.map(order => ({
      ...order,
      createdAt: new Date(order.createdAt).toLocaleDateString(),
    })));

    res.header('Content-Type', 'text/csv');
    res.attachment('orders_data.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error in exportOrders:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.trackOrder = async (req, res) => {
  try {
    const { orderNumber } = req.query;
    const order = await Order.findOne({ orderNumber }).populate('items.product user');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!req.user.isAdmin && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error in trackOrder:', error);
    res.status(400).json({ message: error.message });
  }
};
