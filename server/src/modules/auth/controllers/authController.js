const crypto = require('crypto');
const authService = require('../services/authService');
const { AppError } = require('../../../shared/middleware/errorHandler');
const { cloudinary } = require('../../../shared/config/cloudinary');
const User = require('../models/User');
const Session = require('../models/Session');
const RolePermission = require('../models/RolePermission');
const AuditLog = require('../../../shared/models/AuditLog');
const { PUBLIC_ROLES, PRIVILEGED_ROLES } = require('../schemas/authSchemas');

const ROLE_ORDER = [...PUBLIC_ROLES, ...PRIVILEGED_ROLES];
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  content_creator: 'Content Creator',
  sales: 'Sales',
  support_executive: 'Support Executive',
  hr: 'HR',
  seo_manager: 'SEO Manager',
  finance_manager: 'Finance Manager',
};

const PERMISSION_MODULES = [
  { moduleKey: 'identity', moduleLabel: 'Identity & Governance', permissionKey: 'users.read', capabilityLabel: 'Manage User Directory' },
  { moduleKey: 'ledger', moduleLabel: 'Ledger & Settlement', permissionKey: 'finance.write', capabilityLabel: 'Financial Reconciliation' },
  { moduleKey: 'cms_read', moduleLabel: 'Content (Read)', permissionKey: 'cms.read', capabilityLabel: 'View Posts, Pages, Categories' },
  { moduleKey: 'editorial', moduleLabel: 'Content (Create/Edit)', permissionKey: 'cms.update', capabilityLabel: 'Create & Edit Content' },
  { moduleKey: 'cms_delete', moduleLabel: 'Content (Delete)', permissionKey: 'cms.delete', capabilityLabel: 'Delete Content' },
  { moduleKey: 'seo_read', moduleLabel: 'SEO (Read)', permissionKey: 'seo.read', capabilityLabel: 'View SEO Pages, Audit, Redirects, Keywords' },
  { moduleKey: 'seo_write', moduleLabel: 'SEO (Write)', permissionKey: 'seo.write', capabilityLabel: 'Create & Edit SEO Pages, Redirects, Keywords' },
  { moduleKey: 'seo_publish', moduleLabel: 'SEO (Publish)', permissionKey: 'seo.publish', capabilityLabel: 'Publish & Archive SEO Pages' },
  { moduleKey: 'analytics', moduleLabel: 'Analytics', permissionKey: 'analytics.read', capabilityLabel: 'View Analytics & Reports' },
  { moduleKey: 'support', moduleLabel: 'Service Operations', permissionKey: 'tickets.update', capabilityLabel: 'Support Workflow' },
  { moduleKey: 'chatbot', moduleLabel: 'Chatbot', permissionKey: 'chatbot.manage', capabilityLabel: 'Manage Chatbot & Sessions' },
  { moduleKey: 'crm', moduleLabel: 'CRM & Growth', permissionKey: 'crm.write', capabilityLabel: 'Lead Lifecycle' },
];

// ─── Shared cookie option factory ─────────────────────────────────────────────
// Centralised so every set/clear call uses identical flags.

const isProduction = () => process.env.NODE_ENV === 'production';

const cookieOptions = (maxAgeMs) => ({
  httpOnly: true,
  secure: isProduction(),
  // For cross-domain deployments (e.g., .vercel.app to .nowazone.com), SameSite MUST be 'none'
  sameSite: isProduction() ? 'none' : 'lax',
  path: '/',
  maxAge: maxAgeMs,
});

const ACCESS_TOKEN_TTL  = 15 * 60 * 1000;          // 15 minutes (ms)
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000;  // default (ms)
const CSRF_TOKEN_TTL    = REFRESH_TOKEN_TTL;

// Non-httpOnly so the browser JS can read and forward it as X-CSRF-Token
const csrfCookieOptions = () => ({
  httpOnly: false,
  secure: isProduction(),
  sameSite: isProduction() ? 'none' : 'lax',
  path: '/',
  maxAge: CSRF_TOKEN_TTL,
});

const clearCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: isProduction() ? 'none' : 'lax',
  path: '/',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the caller is an API/mobile client that wants tokens in
 * the response body (instead of — or in addition to — cookies).
 * Web browsers should never set this header.
 */
const isMobileClient = (req) =>
  req.headers['x-client-type'] === 'mobile' ||
  req.headers['x-client-type'] === 'api';

/** Set both the httpOnly auth cookies and (optionally) the readable CSRF cookie. */
const setAuthCookies = (res, { accessToken, refreshToken, csrfToken, refreshTokenTtlMs }) => {
  res.cookie('accessToken',  accessToken,  cookieOptions(ACCESS_TOKEN_TTL));
  res.cookie('refreshToken', refreshToken, cookieOptions(refreshTokenTtlMs || REFRESH_TOKEN_TTL));
  if (csrfToken) {
    res.cookie('csrf-token', csrfToken, csrfCookieOptions());
  }
};

const clearAuthCookies = (res) => {
  res.clearCookie('accessToken',  clearCookieOptions());
  res.clearCookie('refreshToken', clearCookieOptions());
  res.clearCookie('csrf-token',   { ...clearCookieOptions(), httpOnly: false });
};

// ─── Controller ───────────────────────────────────────────────────────────────

class AuthController {
  // POST /auth/register  (public)
  async register(req, res, next) {
    try {
      const user = await authService.register(req.validated);

      res.status(201).json({
        status: 'success',
        message: 'Registration successful',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/login  (public)
  async login(req, res, next) {
    try {
      const { email, password, rememberMe } = req.validated;
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');

      const result = await authService.login(email, password, ipAddress, userAgent, Boolean(rememberMe));

      // 2FA checkpoint — return a short-lived temp token; no full session yet
      if (result.requiresTwoFactor) {
        return res.status(200).json({
          status: 'success',
          message: '2FA verification required',
          data: { requiresTwoFactor: true, tempToken: result.tempToken },
        });
      }

      const csrfToken = crypto.randomBytes(32).toString('hex');

      setAuthCookies(res, {
        accessToken:  result.accessToken,
        refreshToken: result.refreshToken,
        csrfToken,
        refreshTokenTtlMs: result.refreshTokenTtlMs,
      });

      // Web clients receive CSRF token + user only — tokens stay in httpOnly cookies.
      // API/mobile clients additionally receive the raw tokens for Bearer usage.
      const responseData = {
        user: result.user,
        csrfToken,
        ...(isMobileClient(req) && {
          accessToken:  result.accessToken,
          refreshToken: result.refreshToken,
        }),
      };

      res.status(200).json({
        status: 'success',
        message: 'Login successful',
        data: responseData,
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/google  (public) — Sign in with Google ID token; find or create customer user
  async googleLogin(req, res, next) {
    try {
      const { id_token } = req.validated;
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');

      const result = await authService.googleLoginOrRegister(id_token, ipAddress, userAgent);

      const csrfToken = crypto.randomBytes(32).toString('hex');
      setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        csrfToken,
        refreshTokenTtlMs: result.refreshTokenTtlMs,
      });

      const responseData = {
        user: result.user,
        csrfToken,
        ...(isMobileClient(req) && {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        }),
      };

      res.status(200).json({
        status: 'success',
        message: 'Signed in with Google',
        data: responseData,
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/refresh  (public)
  async refreshToken(req, res, next) {
    try {
      // Prefer the httpOnly cookie (web); fall back to body (API/mobile)
      const rawRefreshToken =
        req.cookies.refreshToken ||
        req.validated?.refreshToken ||
        req.body.refreshToken;

      if (!rawRefreshToken) {
        return next(new AppError('Refresh token required', 400));
      }

      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');

      const result = await authService.refreshAccessToken(rawRefreshToken, ipAddress, userAgent);

      const csrfToken = crypto.randomBytes(32).toString('hex');

      setAuthCookies(res, {
        accessToken:  result.accessToken,
        refreshToken: result.refreshToken,
        csrfToken,
        refreshTokenTtlMs: result.refreshTokenTtlMs,
      });

      const responseData = {
        user: result.user,
        csrfToken,
        ...(isMobileClient(req) && {
          accessToken:  result.accessToken,
          refreshToken: result.refreshToken,
        }),
      };

      res.status(200).json({
        status: 'success',
        data: responseData,
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/logout  (protected)
  async logout(req, res, next) {
    try {
      const rawRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
      await authService.logout(req.user._id, req.token, rawRefreshToken);

      clearAuthCookies(res);

      res.status(200).json({
        status: 'success',
        message: 'Logout successful',
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /auth/profile  (protected)
  async getProfile(req, res, next) {
    try {
      // Refresh the CSRF token alongside the profile response so the client
      // always has a current token after a page reload.
      const csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie('csrf-token', csrfToken, csrfCookieOptions());

      let u = req.user;
      const roles = u.roles?.length ? u.roles : (u.role ? [u.role] : []);
      if (roles.includes('support_executive')) {
        const matrixDefaults = authService.getDefaultPermissionsFromMatrix('support_executive');
        const perms = u.permissions || [];
        const missing = matrixDefaults.filter((p) => !perms.includes(p));
        if (missing.length > 0) {
          const userDoc = await User.findById(u._id).select('permissions');
          if (userDoc) {
            const merged = [...new Set([...(userDoc.permissions || []), ...matrixDefaults])];
            userDoc.permissions = merged;
            await userDoc.save();
            u = await User.findById(u._id).select('-password -twoFactorSecret -twoFactorCodeHash -twoFactorCodeExpires -passwordResetToken -passwordResetExpires -failedLoginAttempts -lockoutUntil -tokenInvalidBefore');
          }
        }
      }

      const userObj = u.toObject ? u.toObject() : { ...u };
      const safeUser = {
        ...userObj,
        roles: u.roles?.length ? u.roles : (u.role ? [u.role] : []),
      };

      res.status(200).json({
        status: 'success',
        data: { user: safeUser, csrfToken },
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /auth/profile (protected)
  async updateProfile(req, res, next) {
    try {
      const user = await authService.updateProfile(req.user._id, req.validated);
      res.status(200).json({
        status: 'success',
        message: 'Profile updated successfully',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /auth/profile/password (protected)
  async updatePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.validated;
      const result = await authService.updatePassword(req.user._id, currentPassword, newPassword);

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /auth/profile/avatar (protected)
  async updateAvatar(req, res, next) {
    try {
      if (!req.file) {
        return next(new AppError('No image uploaded', 400));
      }

      const User = require('../models/User');
      const user = await User.findById(req.user._id);
      if (!user || !user.isActive) {
        return next(new AppError('User not found or inactive', 404));
      }

      const previousPublicId = user.profileImage?.publicId;
      user.profileImage = {
        url: req.file.path,
        publicId: req.file.filename,
      };
      await user.save({ validateBeforeSave: false });

      if (previousPublicId && previousPublicId !== req.file.filename) {
        try {
          await cloudinary.uploader.destroy(previousPublicId);
        } catch (_) {
          // Do not fail profile update if old asset deletion fails.
        }
      }

      res.status(200).json({
        status: 'success',
        message: 'Profile image updated successfully',
        data: { profileImage: user.profileImage },
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/forgot-password  (public, rate-limited)
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.validated;
      const result = await authService.forgotPassword(email);

      // Always 200 — prevents email enumeration; never expose reset link in response
      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/2fa/verify-login (public)
  async verifyLogin2FA(req, res, next) {
    try {
      const { tempToken, token } = req.validated;
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');

      const result = await authService.verifyLogin2FA(tempToken, token, ipAddress, userAgent);
      const csrfToken = crypto.randomBytes(32).toString('hex');

      setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        csrfToken,
        refreshTokenTtlMs: result.refreshTokenTtlMs,
      });

      const responseData = {
        user: result.user,
        csrfToken,
        ...(isMobileClient(req) && {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        }),
      };

      res.status(200).json({
        status: 'success',
        message: '2FA verification successful',
        data: responseData,
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/2fa/setup (protected)
  async setup2FA(req, res, next) {
    try {
      const result = await authService.setup2FA(req.user._id);
      res.status(200).json({ status: 'success', message: result.message });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/2fa/enable (protected)
  async enable2FA(req, res, next) {
    try {
      const { token } = req.validated;
      const result = await authService.enable2FA(req.user._id, token);
      res.status(200).json({ status: 'success', message: result.message });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/2fa/disable (protected)
  async disable2FA(req, res, next) {
    try {
      const { password } = req.validated;
      const result = await authService.disable2FA(req.user._id, password);
      res.status(200).json({ status: 'success', message: result.message });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/reset-password/:token  (public, rate-limited)
  async resetPassword(req, res, next) {
    try {
      const { token } = req.params;
      const { password } = req.validated;

      if (!token) {
        return next(new AppError('Reset token is required', 400));
      }

      const result = await authService.resetPassword(token, password);

      // Clear any lingering auth cookies
      clearAuthCookies(res);

      res.status(200).json({ status: 'success', message: result.message });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/admin/users  (protected, admin/super_admin only)
  async createUserAdmin(req, res, next) {
    try {
      const callerRoles = req.user.roles?.length ? req.user.roles : (req.user.role ? [req.user.role] : []);
      const callerRole = callerRoles[0] || req.user.role;
      const user = await authService.createUserAdmin(req.validated, callerRole);

      res.status(201).json({
        status: 'success',
        message: 'User created successfully',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /auth/admin/users  (protected, admin/super_admin only)
  async listUsers(req, res, next) {
    try {
      const page  = Math.max(parseInt(req.query.page,  10) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const skip  = (page - 1) * limit;

      const [users, total] = await Promise.all([
        User.find()
          .select('-permissions +failedLoginAttempts +lockoutUntil')
          .sort('-createdAt')
          .skip(skip)
          .limit(limit),
        User.countDocuments(),
      ]);

      const normalizedUsers = users.map((u) => {
        const obj = u.toObject ? u.toObject() : u;
        return {
          ...obj,
          roles: u.roles?.length ? u.roles : (u.role ? [u.role] : []),
          isLocked: Boolean(u.lockoutUntil && u.lockoutUntil > new Date()),
        };
      });

      res.status(200).json({
        status: 'success',
        data: { users: normalizedUsers, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /auth/admin/users/:id
  async updateUser(req, res, next) {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return next(new AppError('User not found', 404));

      const userRoles = user.roles?.length ? user.roles : (user.role ? [user.role] : []);
      const callerRoles = req.user.roles?.length ? req.user.roles : (req.user.role ? [req.user.role] : []);
      if (userRoles.includes('super_admin') && !callerRoles.includes('super_admin')) {
        return next(new AppError('Super admin accounts cannot be modified by admins', 403));
      }

      const { name, email, roles, phone, jobTitle, department } = req.validated || req.body;

      if (name !== undefined) user.name = name;
      if (email !== undefined) {
        const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
        if (existing) return next(new AppError('Email already in use', 400));
        user.email = email.toLowerCase();
      }
      if (roles !== undefined && Array.isArray(roles)) {
        const userRoles = user.roles?.length ? user.roles : (user.role ? [user.role] : []);
        if (user._id.toString() === req.user.id) {
          const reqRoles = new Set(roles);
          const hadSuperAdmin = userRoles.includes('super_admin');
          const hasSuperAdmin = roles.includes('super_admin');
          if (hadSuperAdmin && !hasSuperAdmin) {
            return next(new AppError('You cannot remove super_admin from your own account', 403));
          }
        }
        if (userRoles.includes('super_admin') && !roles.includes('super_admin')) {
          return next(new AppError('Cannot demote super admin', 403));
        }
        user.roles = roles;
        user.role = roles[0];
        user.permissions = await authService.getMergedPermissionsForRoles(roles);
      }
      if (phone !== undefined) user.phone = phone;
      if (jobTitle !== undefined) user.jobTitle = jobTitle;
      if (department !== undefined) user.department = department;

      await user.save({ validateBeforeSave: true });

      const userObj = user.toObject ? user.toObject() : user;
      const safeUser = {
        ...userObj,
        roles: user.roles?.length ? user.roles : (user.role ? [user.role] : []),
      };

      res.status(200).json({
        status: 'success',
        message: 'User updated successfully',
        data: { user: safeUser },
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/admin/users/:id/send-password-reset
  async sendPasswordReset(req, res, next) {
    try {
      await authService.sendPasswordResetForUser(req.params.id);
      res.status(200).json({
        status: 'success',
        message: 'Password reset email sent to user',
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /auth/admin/users/:id/profile
  async getUserAdminProfile(req, res, next) {
    try {
      const user = await User.findById(req.params.id).select('+failedLoginAttempts +lockoutUntil');
      if (!user) return next(new AppError('User not found', 404));

      const sessions = await Session.find({ user: user._id })
        .sort('-updatedAt')
        .limit(20)
        .select('ipAddress userAgent isActive expiresAt updatedAt createdAt');
      const activities = await AuditLog.find({ user: user._id })
        .sort('-timestamp')
        .limit(25)
        .select('action resource method ipAddress timestamp createdAt');

      const ipSummary = new Map();
      sessions.forEach((s) => {
        const key = s.ipAddress || 'unknown';
        const count = ipSummary.get(key) || 0;
        ipSummary.set(key, count + 1);
      });

      const userObj = user.toObject ? user.toObject() : user;
      const safeUser = {
        ...userObj,
        roles: user.roles?.length ? user.roles : (user.role ? [user.role] : []),
      };

      res.status(200).json({
        status: 'success',
        data: {
          user: safeUser,
          security: {
            failedLoginAttempts: user.failedLoginAttempts || 0,
            lockoutUntil: user.lockoutUntil || null,
            isLocked: Boolean(user.lockoutUntil && user.lockoutUntil > new Date()),
          },
          sessions,
          activities,
          ipHistory: Array.from(ipSummary.entries()).map(([ip, count]) => ({ ip, count })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/admin/users/:id/force-logout
  async forceLogoutUser(req, res, next) {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return next(new AppError('User not found', 404));

      user.tokenInvalidBefore = new Date();
      await user.save({ validateBeforeSave: false });
      await Session.updateMany({ user: user._id, isActive: true }, { isActive: false, isConsumed: true });

      res.status(200).json({
        status: 'success',
        message: 'User has been force-logged out from active sessions',
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/admin/users/:id/lock
  async lockUser(req, res, next) {
    try {
      const minutes = Math.max(parseInt(req.body?.minutes, 10) || 60, 1);
      const user = await User.findById(req.params.id).select('+failedLoginAttempts +lockoutUntil');
      if (!user) return next(new AppError('User not found', 404));

      // Super admin accounts cannot be locked (by anyone)
      const userRoles = user.roles?.length ? user.roles : (user.role ? [user.role] : []);
      if (userRoles.includes('super_admin')) {
        return next(new AppError('Super admin accounts cannot be locked', 403));
      }
      // Nobody can lock their own account
      if (user._id.toString() === req.user.id) {
        return next(new AppError('You cannot lock your own account', 403));
      }

      user.lockoutUntil = new Date(Date.now() + minutes * 60 * 1000);
      user.failedLoginAttempts = Math.max(user.failedLoginAttempts || 0, 1);
      user.tokenInvalidBefore = new Date();
      await user.save({ validateBeforeSave: false });
      await Session.updateMany({ user: user._id, isActive: true }, { isActive: false, isConsumed: true });

      res.status(200).json({ status: 'success', message: `User locked for ${minutes} minute(s)` });
    } catch (error) {
      next(error);
    }
  }

  // POST /auth/admin/users/:id/unlock
  async unlockUser(req, res, next) {
    try {
      const user = await User.findById(req.params.id).select('+failedLoginAttempts +lockoutUntil');
      if (!user) return next(new AppError('User not found', 404));

      user.failedLoginAttempts = 0;
      user.lockoutUntil = undefined;
      await user.save({ validateBeforeSave: false });

      res.status(200).json({ status: 'success', message: 'User unlocked successfully' });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /auth/admin/users/:id
  async deleteUser(req, res, next) {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return next(new AppError('User not found', 404));

      if (user._id.toString() === req.user.id) {
        return next(new AppError('You cannot delete your own account', 403));
      }
      const userRoles = user.roles?.length ? user.roles : (user.role ? [user.role] : []);
      const callerRoles = req.user.roles?.length ? req.user.roles : (req.user.role ? [req.user.role] : []);
      if (userRoles.includes('super_admin') && !callerRoles.includes('super_admin')) {
        return next(new AppError('Super admin accounts cannot be deleted by admins', 403));
      }

      await Session.deleteMany({ user: user._id });
      await User.findByIdAndDelete(user._id);

      res.status(200).json({ status: 'success', message: 'User deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  // GET /auth/audit-logs  (protected, admin/super_admin only)
  async getAuditLogs(req, res, next) {
    try {
      const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const skip  = (page - 1) * limit;

      const filter = {};

      // Date range (from/to) - inclusive
      const { from, to, search, actions } = req.query;
      if (from || to) {
        const range = {};
        if (from) {
          const fromDate = new Date(from);
          if (!Number.isNaN(fromDate.getTime())) {
            range.$gte = fromDate;
          }
        }
        if (to) {
          const toDate = new Date(to);
          if (!Number.isNaN(toDate.getTime())) {
            toDate.setHours(23, 59, 59, 999);
            range.$lte = toDate;
          }
        }
        if (Object.keys(range).length) {
          filter.timestamp = range;
        }
      }

      // Filter by actions list (comma-separated)
      if (typeof actions === 'string' && actions.trim().length) {
        const actionList = actions.split(',').map((a) => a.trim()).filter(Boolean);
        if (actionList.length) {
          filter.action = { $in: actionList };
        }
      }

      // Text search over action/resource/ip/userAgent
      if (typeof search === 'string' && search.trim().length) {
        const regex = new RegExp(search.trim(), 'i');
        filter.$or = [
          { action: regex },
          { resource: regex },
          { ipAddress: regex },
          { userAgent: regex },
        ];
      }

      const [logs, total] = await Promise.all([
        AuditLog.find(filter)
          .sort('-timestamp')
          .skip(skip)
          .limit(limit)
          .populate('user', 'name email')
          .lean(),
        AuditLog.countDocuments(filter),
      ]);

      const normalized = logs.map((log) => ({
        _id: log._id,
        action: log.action,
        resource: log.resource,
        userId: log.user ? { name: log.user.name, email: log.user.email } : null,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        metadata: log.requestBody,
        createdAt: log.timestamp || log.createdAt,
      }));

      res.status(200).json({
        status: 'success',
        data: {
          logs: normalized,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /auth/audit-logs/export  (CSV export)
  async exportAuditLogs(req, res, next) {
    try {
      const { search, actions, from, to, limit } = req.query;
      const max = Math.min(parseInt(limit, 10) || 10000, 20000);

      const filter = {};

      if (from || to) {
        const range = {};
        if (from) {
          const fromDate = new Date(from);
          if (!Number.isNaN(fromDate.getTime())) {
            range.$gte = fromDate;
          }
        }
        if (to) {
          const toDate = new Date(to);
          if (!Number.isNaN(toDate.getTime())) {
            toDate.setHours(23, 59, 59, 999);
            range.$lte = toDate;
          }
        }
        if (Object.keys(range).length) {
          filter.timestamp = range;
        }
      }

      if (typeof actions === 'string' && actions.trim().length) {
        const actionList = actions.split(',').map((a) => a.trim()).filter(Boolean);
        if (actionList.length) {
          filter.action = { $in: actionList };
        }
      }

      if (typeof search === 'string' && search.trim().length) {
        const regex = new RegExp(search.trim(), 'i');
        filter.$or = [
          { action: regex },
          { resource: regex },
          { ipAddress: regex },
          { userAgent: regex },
        ];
      }

      const logs = await AuditLog.find(filter)
        .sort('-timestamp')
        .limit(max)
        .populate('user', 'name email')
        .lean();

      const header = ['timestamp', 'action', 'resource', 'userName', 'userEmail', 'ipAddress', 'userAgent'];
      const rows = logs.map((log) => [
        (log.timestamp || log.createdAt || '').toISOString?.() || '',
        log.action || '',
        log.resource || '',
        log.user?.name || '',
        log.user?.email || '',
        log.ipAddress || '',
        log.userAgent || '',
      ]);

      const escapeField = (v) => {
        const s = String(v ?? '');
        if (s.includes('"') || s.includes(',') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const csv = [
        header.join(','),
        ...rows.map((r) => r.map(escapeField).join(',')),
      ].join('\n');

      const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }

  // GET /auth/admin/dashboard  (protected, admin/super_admin only)
  async getAdminDashboard(req, res, next) {
    try {
      const [totalUsers, adminCount, activeSessions, recentAuditLogs] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({
          $or: [
            { role: { $in: ['admin', 'super_admin'] } },
            { roles: { $in: ['admin', 'super_admin'] } },
          ],
        }),
        Session.countDocuments({ isActive: true }),
        AuditLog.find()
          .sort('-timestamp')
          .limit(8)
          .populate('user', 'name email')
          .lean(),
      ]);

      const activities = recentAuditLogs.map((log) => ({
        _id: log._id,
        action: log.action,
        resource: log.resource,
        user: log.user ? { name: log.user.name, email: log.user.email } : null,
        timestamp: log.timestamp,
      }));

      res.status(200).json({
        status: 'success',
        data: {
          totalUsers,
          adminCount,
          activeSessions,
          recentActivities: activities,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /auth/admin/role-permissions
  async getRolePermissions(req, res, next) {
    try {
      const saved = await RolePermission.find({ role: { $in: ROLE_ORDER } }).select('role permissions');
      const savedMap = new Map(saved.map((item) => [item.role, item.permissions || []]));

      const rolePermissions = [];
      for (const role of ROLE_ORDER) {
        const savedPerms = savedMap.get(role) || [];
        const matrixDefaults = authService.getDefaultPermissionsFromMatrix(role) || [];
        const merged = [...new Set([...savedPerms, ...matrixDefaults])];
        rolePermissions.push({
          role,
          label: ROLE_LABELS[role] || role,
          permissions: merged,
        });
        if (merged.length > savedPerms.length) {
          await RolePermission.findOneAndUpdate(
            { role },
            { role, permissions: merged, updatedBy: req.user._id },
            { upsert: true, new: true }
          );
          await User.updateMany({ role }, { permissions: merged });
        }
      }

      const matrix = PERMISSION_MODULES.map((module) => ({
        ...module,
        roles: ROLE_ORDER.map((role) => ({
          role,
          allowed: rolePermissions.find((r) => r.role === role)?.permissions?.includes('*') ||
            rolePermissions.find((r) => r.role === role)?.permissions?.includes(module.permissionKey),
        })),
      }));

      res.status(200).json({
        status: 'success',
        data: {
          roles: ROLE_ORDER.map((role) => ({ key: role, label: ROLE_LABELS[role] || role })),
          modules: matrix,
          rolePermissions,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // PUT /auth/admin/role-permissions
  async updateRolePermissions(req, res, next) {
    try {
      const payload = Array.isArray(req.body?.rolePermissions) ? req.body.rolePermissions : [];
      if (payload.length === 0) {
        return next(new AppError('rolePermissions array is required', 400));
      }

      for (const entry of payload) {
        if (!entry?.role || !ROLE_ORDER.includes(entry.role)) {
          return next(new AppError(`Invalid role in matrix: ${entry?.role || 'unknown'}`, 400));
        }
        const permissions = Array.isArray(entry.permissions) ? entry.permissions : [];
        await RolePermission.findOneAndUpdate(
          { role: entry.role },
          { role: entry.role, permissions, updatedBy: req.user._id },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        await User.updateMany({ role: entry.role }, { permissions });
      }

      res.status(200).json({
        status: 'success',
        message: 'Role permission matrix updated',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
