const mongoose = require('mongoose');

const sitemapConfigSchema = new mongoose.Schema(
  {
    baseUrl: { type: String, trim: true, required: true },
    includeStaticPages: { type: Boolean, default: true },
    includeDynamicPages: { type: Boolean, default: true },
    includeImages: { type: Boolean, default: false },
    locales: [{ type: String, trim: true }],
    excludedPaths: [{ type: String, trim: true }],
    defaultChangefreq: { type: String, trim: true, default: 'weekly' },
    defaultPriority: { type: Number, default: 0.8 },
    autoGenerate: { type: Boolean, default: false },
    lastGeneratedAt: { type: Date },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SitemapConfig', sitemapConfigSchema);
