// controllers/cartController.js
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { sendPushToUser } = require('../routes/notificationsRoutes'); // NEW – push util

/* ------------------------------------------------------------------
   HELPERS – push only when user is offline
------------------------------------------------------------------ */
const pushIfCartNotEmpty = async (userId) => {
  const onlineUsers = require('../server').onlineUsers; // from server.js
  if (onlineUsers?.has(userId)) return;               // online → UI already shows badge

  const title = 'Your cart is waiting!';
  const body  = 'You have items in your cart – complete checkout anytime.';
  const url   = '/cart.html';

  await sendPushToUser(userId, title, body, url);
  console.log(`[PUSH] Cart not empty → offline user ${userId}`);
};

/* ------------------------------------------------------------------
   ADD TO CART – push if cart becomes non‑empty
------------------------------------------------------------------ */
exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || quantity < 1) {
      return res.status(400).json({ message: 'Invalid product or quantity' });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

    const wasEmpty = cart.items.length === 0;

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = quantity;
    } else {
      cart.items.push({ product: productId, quantity });
    }

    await cart.save();
    await cart.populate('items.product');

    // NEW: push only when cart goes from empty → non‑empty
    if (wasEmpty && cart.items.length > 0) {
      await pushIfCartNotEmpty(req.user._id);
    }

    res.json(cart);
  } catch (error) {
    console.error('Error in addToCart:', error);
    res.status(500).json({ message: error.message });
  }
};

/* ------------------------------------------------------------------
   REMOVE FROM CART – push if cart becomes empty
------------------------------------------------------------------ */
exports.removeFromCart = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ message: 'Product ID required' });

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const beforeCount = cart.items.length;
    cart.items = cart.items.filter(
      item => item.product.toString() !== productId
    );

    await cart.save();
    await cart.populate('items.product');

    // NEW: push when cart becomes empty (optional – you can remove if you don’t want it)
    if (beforeCount > 0 && cart.items.length === 0) {
      await pushIfCartNotEmpty(req.user._id);
    }

    res.json(cart);
  } catch (error) {
    console.error('Error in removeFromCart:', error);
    res.status(500).json({ message: error.message });
  }
};

/* ------------------------------------------------------------------
   GET CART – unchanged (kept for completeness)
------------------------------------------------------------------ */
exports.getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!cart) {
      return res.json({ user: req.user._id, items: [] });
    }
    res.json(cart);
  } catch (error) {
    console.error('Error in getCart:', error);
    res.status(500).json({ message: error.message });
  }
};

/* ------------------------------------------------------------------
   GET ALL CARTS (admin) – unchanged
------------------------------------------------------------------ */
exports.getAllCarts = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    const carts = await Cart.find().populate('items.product user');
    res.json(carts);
  } catch (error) {
    console.error('Error in getAllCarts:', error);
    res.status(500).json({ message: error.message });
  }
};

/* ------------------------------------------------------------------
   MERGE CART (guest → logged‑in) – push if result is non‑empty
------------------------------------------------------------------ */
exports.mergeCart = async (req, res) => {
  try {
    const { cart } = req.body;
    if (!Array.isArray(cart)) return res.status(400).json({ message: 'Invalid cart data' });

    let userCart = await Cart.findOne({ user: req.user._id });
    if (!userCart) {
      userCart = new Cart({ user: req.user._id, items: [] });
    }

    const wasEmpty = userCart.items.length === 0;

    for (const item of cart) {
      const { productId, quantity } = item;
      if (!productId || quantity < 1) continue;

      const product = await Product.findById(productId);
      if (product) {
        const existingItem = userCart.items.find(
          i => i.product.toString() === productId
        );
        if (existingItem) {
          existingItem.quantity += quantity;
        } else {
          userCart.items.push({ product: productId, quantity });
        }
      }
    }

    await userCart.save();
    await userCart.populate('items.product');

    // NEW: push only when cart goes from empty → non‑empty
    if (wasEmpty && userCart.items.length > 0) {
      await pushIfCartNotEmpty(req.user._id);
    }

    res.json({ message: 'Cart merged successfully', cart: userCart });
  } catch (error) {
    console.error('Error in mergeCart:', error);
    res.status(500).json({ message: error.message });
  }
};