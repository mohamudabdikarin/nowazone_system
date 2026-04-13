const AuditLog = require('../models/AuditLog');

const auditLogger = (action) => {
  return (req, res, next) => {
    const originalJson = res.json;

    res.json = function (data) {
      // Restore immediately to avoid double-patching on retries or error responses
      res.json = originalJson;

      if (res.statusCode >= 200 && res.statusCode < 300) {
        AuditLog.create({
          user: req.user?._id || null,
          action,
          resource: req.originalUrl,
          method: req.method,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          requestBody: req.body,
          timestamp: new Date(),
        }).catch(err => console.error('Audit log error:', err));
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

module.exports = auditLogger;
