const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'error', 'lead', 'subscriber', 'ticket', 'invoice', 'job', 'system'],
    default: 'info',
  },
  // null = broadcast to all; otherwise target specific user
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  isRead: { type: Boolean, default: false },
  isGlobal: { type: Boolean, default: false },
  link: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ isGlobal: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
