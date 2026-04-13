const Subscriber = require('../models/Subscriber');
const { AppError } = require('../../../shared/middleware/errorHandler');
const notificationController = require('../../notifications/controllers/notificationController');

exports.subscribe = async (req, res, next) => {
  try {
    const { email, name, country, tags } = req.body;
    const existing = await Subscriber.findOne({ email });
    if (existing) {
      if (existing.status === 'unsubscribed') {
        existing.status = 'active';
        existing.unsubscribedAt = undefined;
      }
      if (name) existing.name = name;
      if (country) existing.country = country;
      if (Array.isArray(tags) && tags.length) {
        existing.tags = Array.from(new Set([...(existing.tags || []), ...tags]));
      }
      await existing.save();
      const io = req.app.get('io');
      if (io && existing.status === 'active') {
        await notificationController.createAndEmit(io, {
          title: 'Subscriber re-activated',
          message: `${existing.email} rejoined the subscriber list.`,
          type: 'subscriber',
          isGlobal: true,
          room: 'crm',
          link: '/dashboard/subscribers',
          metadata: { subscriberId: existing._id, email: existing.email },
        });
      }
      return res.json({ status: 'success', message: existing.status === 'active' ? 'Resubscribed successfully' : 'Already subscribed' });
    }

    const subscriber = await Subscriber.create({
      email,
      name,
      country: country || undefined,
      tags: Array.isArray(tags) ? tags : undefined,
      ipAddress: req.ip,
      confirmedAt: new Date(),
    });

    const io = req.app.get('io');
    if (io) {
      await notificationController.createAndEmit(io, {
        title: 'New subscriber received',
        message: `${subscriber.email} subscribed to updates.`,
        type: 'subscriber',
        isGlobal: true,
        room: 'crm',
        link: '/dashboard/subscribers',
        metadata: { subscriberId: subscriber._id, email: subscriber.email },
      });
    }

    res.status(201).json({ status: 'success', message: 'Subscribed successfully' });
  } catch (err) { next(err); }
};

exports.unsubscribe = async (req, res, next) => {
  try {
    const subscriber = await Subscriber.findOneAndUpdate(
      { email: req.body.email },
      { status: 'unsubscribed', unsubscribedAt: new Date() },
      { new: true }
    );
    if (!subscriber) return next(new AppError('Email not found', 404));
    res.json({ status: 'success', message: 'Unsubscribed successfully' });
  } catch (err) { next(err); }
};

exports.listSubscribers = async (req, res, next) => {
  try {
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.country) filter.country = req.query.country;
    if (req.query.search) filter.$or = [
      { email: { $regex: req.query.search, $options: 'i' } },
      { name:  { $regex: req.query.search, $options: 'i' } },
    ];

    const [subscribers, total] = await Promise.all([
      Subscriber.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit),
      Subscriber.countDocuments(filter),
    ]);

    res.json({ status: 'success', data: { subscribers, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    const [total, active, unsubscribed] = await Promise.all([
      Subscriber.countDocuments(),
      Subscriber.countDocuments({ status: 'active' }),
      Subscriber.countDocuments({ status: 'unsubscribed' }),
    ]);
    res.json({ status: 'success', data: { total, active, unsubscribed } });
  } catch (err) { next(err); }
};

exports.deleteSubscriber = async (req, res, next) => {
  try {
    await Subscriber.findByIdAndDelete(req.params.id);
    res.json({ status: 'success', message: 'Subscriber deleted' });
  } catch (err) { next(err); }
};
