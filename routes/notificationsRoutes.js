const express = require('express');
const webpush = require('web-push'); // From server.js setup
const User = require('../models/User'); // Your User model

const router = express.Router();

// POST /api/notifications/subscribe - Save push subscription
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body; // From frontend PushSubscription
    const userId = req.user.id; // From auth middleware

    // Validate sub (basic check)
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    // Find user & add/update sub
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Avoid duplicates
    const existingSubIndex = user.subscriptions?.findIndex(sub => sub.endpoint === endpoint);
    const subscription = { endpoint, keys, createdAt: new Date() };

    if (existingSubIndex > -1) {
      user.subscriptions[existingSubIndex] = subscription; // Update
    } else {
      user.subscriptions = user.subscriptions || [];
      user.subscriptions.push(subscription);
    }

    await user.save();
    res.status(201).json({ message: 'Subscription saved' });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// DELETE /api/notifications/unsubscribe - Remove sub (e.g., on logout)
router.delete('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.subscriptions = user.subscriptions?.filter(sub => sub.endpoint !== endpoint) || [];
    await user.save();

    res.json({ message: 'Subscription removed' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// NEW: Util to send push (export for use in other routes, e.g., productRoutes on new deal)
const sendPushToUser = async (userId, title, body, url = '/') => {
  try {
    const user = await User.findById(userId).select('subscriptions');
    if (!user?.subscriptions?.length) return;

    const payload = JSON.stringify({ title, body, url, icon: '/images/logo.png' });

    // Clean expired subs (webpush auto-handles 410 Gone)
    const validSubs = user.subscriptions.filter(sub => {
      try {
        webpush.sendNotification(sub, payload);
        return true;
      } catch (e) {
        console.error(`Push failed for sub ${sub.endpoint}:`, e.statusCode);
        return false; // Remove on fail (e.g., 410)
      }
    });

    // Update DB with valid subs only
    user.subscriptions = validSubs;
    await user.save();

    console.log(`Push sent to user ${userId}: ${title}`);
  } catch (error) {
    console.error('Send push error:', error);
  }
};

// Export util (call from other files, e.g., in productRoutes: sendPushToUser(userId, 'New Deal!', 'Check it out!', '/products.html'))
module.exports = { router, sendPushToUser };
module.exports.router = router; // For app.use