const Notification = require('../models/Notification');

exports.getMyNotifications = async (req, res, next) => {
  try {
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

    const filter = {
      $or: [
        { userId: req.user._id },
        { isGlobal: true },
      ],
    };
    if (req.query.unreadOnly === 'true') filter.isRead = false;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit),
      Notification.countDocuments({ $or: [{ userId: req.user._id }, { isGlobal: true }], isRead: false }),
    ]);

    res.json({ status: 'success', data: { notifications, unreadCount } });
  } catch (err) { next(err); }
};

exports.markRead = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (ids && ids.length > 0) {
      await Notification.updateMany(
        { _id: { $in: ids }, $or: [{ userId: req.user._id }, { isGlobal: true }] },
        { isRead: true }
      );
    } else {
      await Notification.updateMany(
        { $or: [{ userId: req.user._id }, { isGlobal: true }] },
        { isRead: true }
      );
    }
    res.json({ status: 'success', message: 'Marked as read' });
  } catch (err) { next(err); }
};

exports.deleteNotification = async (req, res, next) => {
  try {
    const deleted = await Notification.findOneAndDelete({
      _id: req.params.id,
      $or: [{ userId: req.user._id }, { isGlobal: true }],
    });
    if (!deleted) {
      return res.status(404).json({ status: 'fail', message: 'Notification not found' });
    }
    res.json({ status: 'success', message: 'Notification deleted' });
  } catch (err) { next(err); }
};

exports.clearNotifications = async (req, res, next) => {
  try {
    const scope = req.query.scope === 'all' ? 'all' : 'read';
    const filter = { $or: [{ userId: req.user._id }, { isGlobal: true }] };
    if (scope === 'read') filter.isRead = true;

    const result = await Notification.deleteMany(filter);
    res.json({
      status: 'success',
      data: { deletedCount: result.deletedCount || 0, scope },
      message: scope === 'all' ? 'All notifications cleared' : 'Read notifications cleared',
    });
  } catch (err) { next(err); }
};

// Helper: create + emit a notification (used by other modules)
exports.createAndEmit = async (io, { title, message, type, userId, isGlobal, link, metadata, room }) => {
  try {
    const notification = await Notification.create({ title, message, type, userId, isGlobal, link, metadata });
    const emitRoom = room || (userId ? `user:${userId}` : (isGlobal ? 'global' : null));
    if (emitRoom) {
      io.to(emitRoom).emit('notification:new', notification);
    }
    return notification;
  } catch (err) {
    console.error('[Notification] Failed to create/emit:', err.message);
  }
};
