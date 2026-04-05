require('dotenv').config();

// ─── Startup environment validation ───────────────────────────────────────────
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_ACCESS_SECRET'];
const MISSING = REQUIRED_ENV.filter((k) => !process.env[k]);
if (MISSING.length) {
  console.error(`[STARTUP] Missing required environment variables: ${MISSING.join(', ')}`);
  if (!process.env.VERCEL) process.exit(1);
}
if ((process.env.JWT_ACCESS_SECRET || '').length < 32) {
  console.warn('[SECURITY WARNING] JWT_ACCESS_SECRET should be at least 32 characters.');
  if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) process.exit(1);
}

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const connectDB = require('./shared/config/database');
const { errorHandler } = require('./shared/middleware/errorHandler');
const { apiLimiter } = require('./shared/middleware/rateLimiter');
const { csrfProtection } = require('./shared/middleware/auth');
const { maintenanceMode, attachSettings } = require('./shared/middleware/maintenanceMode');

// ─── Route imports ─────────────────────────────────────────────────────────────
const authRoutes = require('./modules/auth/routes/authRoutes');
const dashboardRoutes = require('./modules/dashboard/routes/dashboardRoutes');
const leadRoutes = require('./modules/crm/routes/leadRoutes');
const contentRoutes = require('./modules/cms/routes/contentRoutes');
const postRoutes = require('./modules/cms/routes/postRoutes');
const pageRoutes = require('./modules/cms/routes/pageRoutes');
const categoryRoutes = require('./modules/cms/routes/categoryRoutes');
const tagRoutes = require('./modules/cms/routes/tagRoutes');
const commentRoutes = require('./modules/cms/routes/commentRoutes');
const uploadRoutes = require('./modules/cms/routes/uploadRoutes');
const jobRoutes = require('./modules/jobs/routes/jobRoutes');
const applicationRoutes = require('./modules/jobs/routes/applicationRoutes');
const invoiceRoutes = require('./modules/invoices/routes/invoiceRoutes');
const expenseRoutes = require('./modules/expenses/routes/expenseRoutes');
const financeRoutes = require('./modules/finance/routes/financeRoutes');
const ticketRoutes = require('./modules/tickets/routes/ticketRoutes');
const notificationRoutes = require('./modules/notifications/routes/notificationRoutes');
const faqRoutes = require('./modules/faq/routes/faqRoutes');
const subscriberRoutes = require('./modules/subscribers/routes/subscriberRoutes');
const taskRoutes = require('./modules/tasks/routes/taskRoutes');
const calendarRoutes = require('./modules/calendar/routes/calendarRoutes');
const settingsRoutes = require('./modules/settings/routes/settingsRoutes');
const hrRoutes = require('./modules/hr/routes/hrRoutes');
const chatbotRoutes = require('./modules/chatbot/routes/chatbotRoutes');
const analyticsRoutes = require('./modules/analytics/routes/analyticsRoutes');
const formRoutes = require('./modules/forms/routes/formRoutes');
const seoRoutes = require('./modules/seo/routes/seoRoutes');

const app = express();
const server = http.createServer(app);

// ─── Trust proxy ─────────────────────────────────────────────────────────────
app.set('trust proxy', process.env.TRUST_PROXY || (process.env.NODE_ENV === 'production' ? 1 : 0));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000').split(',').map((o) => o.trim());
const corsOptions = {
  origin: (origin, callback) => {
    // In production, block requests without origin (cURL, tools) to strict CORS routes if desired
    if (!origin && process.env.NODE_ENV !== 'production') return callback(null, true);
    if (!origin && process.env.NODE_ENV === 'production') return callback(null, true); // Still allowed for server-to-server, but restricted below for auth
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
};

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, { cors: { origin: allowedOrigins, credentials: true } });

// Expose io globally so controllers can emit events
app.set('io', io);

io.use(async (socket, next) => {
  try {
    const cookies = cookie.parse(socket.handshake.headers.cookie || '');
    const token = cookies.accessToken || socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    if (decoded.temp) return next(new Error('Complete 2FA verification first'));

    const User = require('./modules/auth/models/User');
    const user = await User.findById(decoded.id).select('name role isActive');
    if (!user || !user.isActive) return next(new Error('User not found'));

    socket.user = user;
    next();
  } catch { next(new Error('Invalid or expired token')); }
});

connectDB();

// ─── BullMQ email worker (runs in same process)
if (!process.env.VERCEL) {
  try {
    const { startEmailWorker } = require('./shared/queues/workers/emailWorker');
    startEmailWorker();
    console.log('[Server] Email queue worker started');
  } catch (err) {
    console.warn('[Server] Email worker failed to start:', err.message);
  }

  // ─── Maintenance jobs (backup + log retention) ─────────────────────────────────
  try {
    const { startMaintenanceJobs } = require('./shared/services/maintenanceBackupService');
    startMaintenanceJobs();
    console.log('[Server] Maintenance jobs scheduler started');
  } catch (err) {
    console.warn('[Server] Maintenance jobs failed to start:', err.message);
  }
} else {
  console.log('[Server] Running on Vercel: skipped continuous workers and cron jobs.');
}

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://lh3.googleusercontent.com'],
      connectSrc: ["'self'"], fontSrc: ["'self'"], frameSrc: ["'none'"], objectSrc: ["'none'"],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
// Strip $ and . in body/query/params to prevent NoSQL injection
app.use(mongoSanitize());

app.use('/api', apiLimiter);
app.use('/api', csrfProtection);
app.use('/api', attachSettings);
app.use('/api', maintenanceMode);

// ─── Public maintenance status (no auth; allowed during maintenance) ──────────
app.get('/api/maintenance-status', async (req, res) => {
  try {
    const Settings = require('./modules/settings/models/Settings');
    const doc = await Settings.findOne().lean();
    const maintenanceMode = Boolean(doc?.system?.maintenanceMode);
    return res.json({ status: 'success', data: { maintenanceMode } });
  } catch {
    return res.json({ status: 'success', data: { maintenanceMode: false } });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'success', message: 'Server is running', timestamp: new Date().toISOString() }));

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/faq', faqRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/seo', seoRoutes);

// ─── Socket.IO events ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const userId = socket.user?._id?.toString();
  const role = socket.user?.role || 'unknown';

  console.log(`[Socket] connected: ${socket.id} (role: ${role})`);

  // Join a personal room for targeted notifications
  if (userId) socket.join(`user:${userId}`);

  // Role-based notification rooms (for real-time alerts)
  const adminRoles = ['super_admin', 'admin'];
  if (adminRoles.includes(role) || role === 'hr') socket.join('hr');
  if (adminRoles.includes(role) || role === 'sales') socket.join('crm');

  // Subscribe to analytics (role-gated)
  socket.on('subscribe:analytics', () => {
    const analyticsRoles = ['super_admin', 'admin', 'seo_manager', 'finance_manager'];
    if (analyticsRoles.includes(socket.user?.role)) {
      socket.join('analytics');
    } else {
      socket.emit('error', { message: 'Insufficient permissions for analytics feed' });
    }
  });

  socket.on('disconnect', () => console.log(`[Socket] disconnected: ${socket.id}`));
});

// ─── Public chat namespace (no auth required) ────────────────────────────────
const chatNs = io.of('/chat');
chatNs.on('connection', (socket) => {
  console.log(`[Chat] visitor connected: ${socket.id}`);

  socket.on('join:session', (sessionId) => {
    socket.join(`chat:${sessionId}`);
  });

  socket.on('message', async (data) => {
    try {
      const ChatSession = require('./modules/chatbot/models/ChatSession');
      const ChatbotFaq = require('./modules/chatbot/models/ChatbotFaq');
      const ChatbotConfig = require('./modules/chatbot/models/ChatbotConfig');
      const Ticket = require('./modules/tickets/models/Ticket');
      const { getAIResponse, isGreeting, getGreetingReply } = require('./modules/chatbot/services/aiChatService');

      const { message, sessionId, visitorName, visitorEmail } = data;

      let session;
      if (sessionId) {
        session = await ChatSession.findById(sessionId);
        if (session && session.channel !== 'widget') session = null;
      }
      if (!session) {
        session = await ChatSession.create({
          user: null,
          channel: 'widget',
          status: 'open',
          messages: [],
        });
      }

      const config = await ChatbotConfig.findOne() || {
        isActive: true,
        minConfidence: 0.3,
        escalationEnabled: true,
        escalationPriority: 'medium',
        escalationTicketCategory: 'chat',
        fallbackMessage: "I'm not sure about that. Let me connect you with a team member.",
        temperature: 0.3,
      };
      const faqs = await ChatbotFaq.find({ isActive: true }).lean();

      const historyBeforeThisMessage = [...session.messages];
      session.messages.push({ role: 'user', content: message, source: 'system' });

      let botReply, source = 'fallback', confidence = 1.0;

      // Quick path: avoid expensive model call for simple greetings.
      if (isGreeting(message)) {
        botReply = config.greetingMessage || getGreetingReply();
        source = 'fallback';
      } else {
        // --- AI path ---
        const aiReply = await getAIResponse(message, faqs, historyBeforeThisMessage, config.temperature || 0.3).catch(
          (err) => {
            const msg = String(err.message || '');
            if (msg.includes('403')) {
              console.error('[Chat WS] Ollama 403. Check OLLAMA_BASE_URL and model access.');
            } else if (msg.includes('404') && process.env.USE_OLLAMA === 'true') {
              console.error('[Chat WS] Ollama 404. Is Ollama running? Try: ollama serve. Base URL should be http://127.0.0.1:11434 (server calls /api/chat).');
            } else if (msg.includes('OLLAMA_TIMEOUT')) {
              console.error('[Chat WS] Ollama timeout. Reduce prompt size or increase OLLAMA_TIMEOUT_MS.');
            } else {
              console.error('[Chat WS] Chat AI error:', err.message);
            }
            return null;
          }
        );

        if (aiReply && aiReply !== 'ESCALATE') {
          botReply = aiReply;
          source = 'ai';
        } else if (aiReply === null) {
          // Ollama unavailable — fall back to string-similarity
          function normalize(text) { return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' '); }
          function computeSimilarity(query, candidate) {
            const qT = new Set(normalize(query).split(/\s+/).filter(Boolean));
            const cT = new Set(normalize(candidate).split(/\s+/).filter(Boolean));
            if (!qT.size || !cT.size) return 0;
            let inter = 0;
            qT.forEach(t => { if (cT.has(t)) inter++; });
            return inter / Math.sqrt(qT.size * cT.size);
          }
          let bestMatch = null, bestScore = 0;
          for (const faq of faqs) {
            const matchTarget = [faq.question, ...(faq.tags || [])].join(' ');
            const score = computeSimilarity(message, matchTarget);
            if (score > bestScore) { bestScore = score; bestMatch = faq; }
          }
          confidence = bestScore;
          if (bestMatch && bestScore >= (config.minConfidence || 0.3)) {
            botReply = bestMatch.answer;
            source = 'faq';
          }
        }
      }

      // --- Greeting safeguard: never escalate for simple greetings ---
      if (!botReply && isGreeting(message)) {
        botReply = config.greetingMessage || getGreetingReply();
        source = 'fallback';
      }

      // --- Escalate if needed ---
      if (!botReply) {
        if (config.escalationEnabled !== false) {
          let ticket = null;
          if (session.escalatedTicketId) {
            ticket = await Ticket.findById(session.escalatedTicketId).catch(() => null);
          }
          if (!ticket) {
            ticket = await Ticket.create({
              subject: `Chat escalation: ${message.slice(0, 80)}`,
              description: `Visitor question: ${message}`,
              status: 'open',
              priority: config.escalationPriority || 'medium',
              category: config.escalationTicketCategory || 'chat',
              requesterName: visitorName || 'Website Visitor',
              requesterEmail: visitorEmail || 'visitor@nowazone.com',
            });
            session.escalatedTicketId = ticket._id;
          }
          session.status = 'escalated';
          botReply = config.fallbackMessage || "I'm not fully sure about that. I've connected you with a team member who will respond shortly.";
          source = 'escalation_notice';
          io.to('crm').emit('notification:new', {
            type: 'chat_escalated',
            title: 'Chat escalated to human',
            message: `${visitorName || 'A visitor'} needs help: ${message.slice(0, 100)}`,
            data: { sessionId: session._id, ticketId: session.escalatedTicketId },
          });
        } else {
          botReply = config.fallbackMessage || "I'm not sure about that right now. Please try our contact form.";
        }
      }

      session.messages.push({ role: 'bot', content: botReply, source, confidence, faqId: null });
      await session.save();

      socket.emit('message', { sessionId: session._id.toString(), reply: botReply, source, confidence });

      if (session.status === 'escalated') {
        io.to('crm').emit('chat:escalated', { sessionId: session._id, message, visitorName });
      }
    } catch (err) {
      console.error('[Chat] error:', err.message);
      socket.emit('error', { message: 'Failed to process message' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Chat] visitor disconnected: ${socket.id}`);
  });
});

// ─── 404 + Error handler ──────────────────────────────────────────────────────
app.use((req, res, _next) => res.status(404).json({ status: 'fail', message: 'Route not found' }));
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
  server.listen(PORT, () => console.log(`[Server] running on port ${PORT} (${process.env.NODE_ENV || 'development'})`));
}

// Vercel serverless expects 'app' directly mounted
module.exports = process.env.VERCEL ? app : { app, io };
