const ChatbotConfig = require('../models/ChatbotConfig');
const ChatbotFaq = require('../models/ChatbotFaq');
const ChatSession = require('../models/ChatSession');
const Ticket = require('../../tickets/models/Ticket');
const { AppError } = require('../../../shared/middleware/errorHandler');
const notificationController = require('../../notifications/controllers/notificationController');
const { getAIResponse, isGreeting, getGreetingReply } = require('../services/aiChatService');

async function getOrCreateConfig(userId) {
  let config = await ChatbotConfig.findOne();
  if (!config) {
    config = await ChatbotConfig.create({ updatedBy: userId || null });
  }
  return config;
}

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
}

function computeSimilarity(query, candidate) {
  const queryTokens = new Set(normalize(query).split(/\s+/).filter(Boolean));
  const candidateTokens = new Set(normalize(candidate).split(/\s+/).filter(Boolean));
  if (queryTokens.size === 0 || candidateTokens.size === 0) return 0;

  let intersection = 0;
  queryTokens.forEach((token) => {
    if (candidateTokens.has(token)) intersection += 1;
  });
  return intersection / Math.sqrt(queryTokens.size * candidateTokens.size);
}

exports.getConfig = async (req, res, next) => {
  try {
    const config = await getOrCreateConfig(req.user?._id);
    res.json({ status: 'success', data: { config } });
  } catch (error) {
    next(error);
  }
};

exports.updateConfig = async (req, res, next) => {
  try {
    const config = await getOrCreateConfig(req.user?._id);
    Object.assign(config, req.validated, { updatedBy: req.user?._id || null });
    await config.save();
    res.json({ status: 'success', data: { config } });
  } catch (error) {
    next(error);
  }
};

exports.listFaqs = async (req, res, next) => {
  try {
    const page = Math.max(req.validatedQuery.page || 1, 1);
    const limit = Math.min(req.validatedQuery.limit || 20, 100);

    const filter = {};
    if (typeof req.validatedQuery.isActive === 'boolean') {
      filter.isActive = req.validatedQuery.isActive;
    }
    if (req.validatedQuery.category) {
      filter.category = req.validatedQuery.category;
    }
    if (req.validatedQuery.search) {
      const search = req.validatedQuery.search;
      filter.$or = [
        { question: { $regex: search, $options: 'i' } },
        { answer: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    const [faqs, total] = await Promise.all([
      ChatbotFaq.find(filter)
        .sort({ order: 1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ChatbotFaq.countDocuments(filter),
    ]);

    res.json({
      status: 'success',
      data: {
        faqs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.createFaq = async (req, res, next) => {
  try {
    const highestOrder = await ChatbotFaq.findOne().sort({ order: -1 }).select('order').lean();
    const nextOrder = highestOrder ? (highestOrder.order || 0) + 1 : 0;

    const faq = await ChatbotFaq.create({
      ...req.validated,
      order: nextOrder,
      updatedBy: req.user?._id || null,
    });

    res.status(201).json({ status: 'success', data: { faq } });
  } catch (error) {
    next(error);
  }
};

exports.updateFaq = async (req, res, next) => {
  try {
    const faq = await ChatbotFaq.findByIdAndUpdate(
      req.params.id,
      { ...req.validated, updatedBy: req.user?._id || null },
      { new: true, runValidators: true }
    );
    if (!faq) {
      return next(new AppError('FAQ not found', 404));
    }

    res.json({ status: 'success', data: { faq } });
  } catch (error) {
    next(error);
  }
};

exports.deleteFaq = async (req, res, next) => {
  try {
    const faq = await ChatbotFaq.findByIdAndDelete(req.params.id);
    if (!faq) {
      return next(new AppError('FAQ not found', 404));
    }
    res.json({ status: 'success', message: 'FAQ deleted' });
  } catch (error) {
    next(error);
  }
};

exports.reorderFaqs = async (req, res, next) => {
  try {
    const bulk = ChatbotFaq.collection.initializeUnorderedBulkOp();
    req.validated.items.forEach((item) => {
      bulk.find({ _id: item.id }).updateOne({ $set: { order: item.order } });
    });
    await bulk.execute();
    res.json({ status: 'success', message: 'Order updated' });
  } catch (error) {
    next(error);
  }
};

exports.listSessions = async (req, res, next) => {
  try {
    const page = Math.max(req.validatedQuery.page || 1, 1);
    const limit = Math.min(req.validatedQuery.limit || 20, 100);
    const filter = {};

    if (req.validatedQuery.status) {
      filter.status = req.validatedQuery.status;
    }
    if (Number.isFinite(req.validatedQuery.updatedAfter)) {
      filter.updatedAt = { $gt: new Date(req.validatedQuery.updatedAfter) };
    }

    const [sessions, total] = await Promise.all([
      ChatSession.find(filter)
        .populate('user', 'name email')
        .populate('escalatedTicketId', 'ticketNumber status')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ChatSession.countDocuments(filter),
    ]);

    res.json({
      status: 'success',
      data: {
        sessions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getSession = async (req, res, next) => {
  try {
    const session = await ChatSession.findById(req.params.id)
      .populate('user', 'name email')
      .populate('messages.faqId', 'question')
      .populate('escalatedTicketId', 'ticketNumber status');
    if (!session) {
      return next(new AppError('Session not found', 404));
    }

    res.json({ status: 'success', data: { session } });
  } catch (error) {
    next(error);
  }
};

exports.publicChat = async (req, res, next) => {
  try {
    const config = await getOrCreateConfig();
    if (!config.isActive) {
      return next(new AppError('Chatbot is currently disabled', 503));
    }

    const { message, sessionId, visitorName, visitorEmail } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return next(new AppError('Message is required', 400));
    }

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

    // Capture history before appending the new user message
    const historyBeforeThisMessage = [...session.messages];
    session.messages.push({ role: 'user', content: message, source: 'system' });

    const faqs = await ChatbotFaq.find({ isActive: true }).lean();

    let botReply;
    let source = 'fallback';
    let confidence = 1.0;

    if (!isGreeting(message)) {
      // --- AI path (when local Ollama is enabled) ---
      const aiReply = await getAIResponse(message, faqs, historyBeforeThisMessage, config.temperature || 0.3).catch(
        (err) => {
          const msg = String(err.message || '');
          if (msg.includes('403')) {
            console.error('[Chatbot] Ollama 403. Check OLLAMA_BASE_URL and model access.');
          } else if (msg.includes('404') && process.env.USE_OLLAMA === 'true') {
            console.error('[Chatbot] Ollama 404. Is Ollama running? Try: ollama serve. Base URL should be http://127.0.0.1:11434 (server calls /api/chat).');
          } else if (msg.includes('OLLAMA_TIMEOUT')) {
            console.error('[Chatbot] Ollama timeout. Reduce prompt size or increase OLLAMA_TIMEOUT_MS.');
          } else {
            console.error('[Chatbot] Chat AI error:', err.message);
          }
          return null;
        }
      );

      if (aiReply && aiReply !== 'ESCALATE') {
        botReply = aiReply;
        source = 'ai';
      } else if (aiReply === null) {
        // Ollama unavailable — fall back to string-similarity FAQ matching
        let bestMatch = null;
        let bestScore = 0;
        for (const faq of faqs) {
          const matchTarget = [faq.question, ...(faq.tags || [])].join(' ');
          const score = computeSimilarity(message, matchTarget);
          if (score > bestScore) { bestScore = score; bestMatch = faq; }
        }
        confidence = bestScore;
        if (bestMatch && bestScore >= config.minConfidence) {
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

    // --- Escalate if AI said ESCALATE or no answer found ---
    if (!botReply) {
      if (config.escalationEnabled) {
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
        botReply =
          config.fallbackMessage ||
          "I'm not fully sure about that. I've connected you with a team member who will respond shortly.";
        source = 'escalation_notice';

        const io = req.app.get('io');
        if (io) {
          await notificationController.createAndEmit(io, {
            title: 'Chat escalated to human',
            message: `${visitorName || 'A visitor'} needs help: ${message.slice(0, 100)}`,
            type: 'ticket',
            isGlobal: true,
            room: 'crm',
            link: '/dashboard/tickets',
            metadata: { sessionId: session._id, ticketId: ticket._id },
          });
        }
      } else {
        botReply =
          config.fallbackMessage ||
          "I'm not sure about that right now. Please try our contact form.";
      }
    }

    session.messages.push({
      role: 'bot',
      content: botReply,
      source,
      confidence,
      faqId: null,
    });

    await session.save();

    const responseSession = await ChatSession.findById(session._id)
      .populate('escalatedTicketId', 'ticketNumber status')
      .lean();

    res.json({
      status: 'success',
      data: {
        session: responseSession,
        reply: botReply,
        source,
        confidence,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getPublicSession = async (req, res, next) => {
  try {
    const session = await ChatSession.findOne({
      _id: req.params.sessionId,
      channel: 'widget',
    }).populate('escalatedTicketId', 'ticketNumber status');

    if (!session) {
      return next(new AppError('Session not found', 404));
    }

    res.json({ status: 'success', data: { session } });
  } catch (error) {
    next(error);
  }
};

exports.respondToSession = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return next(new AppError('Message is required', 400));
    }

    const session = await ChatSession.findById(req.params.id);
    if (!session || session.channel !== 'widget') {
      return next(new AppError('Session not found', 404));
    }

    session.messages.push({
      role: 'agent',
      content: message,
      source: 'system',
    });

    if (session.status === 'escalated') {
      session.status = 'resolved';
    }

    await session.save();

    const responseSession = await ChatSession.findById(session._id)
      .populate('escalatedTicketId', 'ticketNumber status')
      .lean();

    const io = req.app.get('io');
    if (io) {
      const chatNs = io.of('/chat');
      chatNs.to(`chat:${session._id}`).emit('agent:message', {
        sessionId: session._id.toString(),
        message,
        from: req.user
          ? { id: req.user._id.toString(), name: req.user.name, email: req.user.email }
          : null,
      });
    }

    res.json({ status: 'success', data: { session: responseSession } });
  } catch (error) {
    next(error);
  }
};

exports.chat = async (req, res, next) => {
  try {
    const config = await getOrCreateConfig(req.user?._id);
    if (!config.isActive) {
      return next(new AppError('Chatbot is currently disabled', 503));
    }

    const { message, sessionId } = req.validated;

    let session;
    if (sessionId) {
      session = await ChatSession.findById(sessionId);
      if (!session) {
        return next(new AppError('Session not found', 404));
      }
    } else {
      session = await ChatSession.create({
        user: req.user?._id || null,
        channel: 'dashboard',
        status: 'open',
        messages: [],
      });
    }

    const historyBeforeThisMessage = [...session.messages];
    session.messages.push({
      role: 'user',
      content: message,
      source: 'system',
    });

    const faqs = await ChatbotFaq.find({ isActive: true }).lean();

    let botReply;
    let source = 'fallback';
    let confidence = 1.0;

    if (!isGreeting(message)) {
      // --- AI path ---
      const aiReply = await getAIResponse(message, faqs, historyBeforeThisMessage, config.temperature || 0.3).catch(
        (err) => {
          const msg = String(err.message || '');
          if (msg.includes('403')) {
            console.error('[Chatbot] Ollama 403. Check OLLAMA_BASE_URL and model access.');
          } else if (msg.includes('404') && process.env.USE_OLLAMA === 'true') {
            console.error('[Chatbot] Ollama 404. Is Ollama running? Try: ollama serve. Base URL should be http://127.0.0.1:11434 (server calls /api/chat).');
          } else if (msg.includes('OLLAMA_TIMEOUT')) {
            console.error('[Chatbot] Ollama timeout. Reduce prompt size or increase OLLAMA_TIMEOUT_MS.');
          } else {
            console.error('[Chatbot] Chat AI error:', err.message);
          }
          return null;
        }
      );

      if (aiReply && aiReply !== 'ESCALATE') {
        botReply = aiReply;
        source = 'ai';
      } else if (aiReply === null) {
        // Ollama unavailable — fall back to string-similarity
        let bestMatch = null;
        let bestScore = 0;
        for (const faq of faqs) {
          const matchTarget = [faq.question, ...(faq.tags || [])].join(' ');
          const score = computeSimilarity(message, matchTarget);
          if (score > bestScore) { bestScore = score; bestMatch = faq; }
        }
        confidence = bestScore;
        if (bestMatch && bestScore >= config.minConfidence) {
          botReply = bestMatch.answer;
          source = 'faq';
          await ChatbotFaq.updateOne(
            { _id: bestMatch._id },
            { $set: { lastTrainedAt: new Date(), updatedBy: req.user?._id || null } }
          );
        }
      }
    }

    if (!botReply) {
      if (config.escalationEnabled) {
        let ticket = null;
        if (session.escalatedTicketId) {
          ticket = await Ticket.findById(session.escalatedTicketId).catch(() => null);
        }
        if (!ticket) {
          ticket = await Ticket.create({
            subject: `Escalated chat: ${message.slice(0, 80)}`,
            description: `User question: ${message}`,
            status: 'open',
            priority: config.escalationPriority,
            category: config.escalationTicketCategory,
            requesterName: req.user?.name || 'Dashboard User',
            requesterEmail: req.user?.email || 'unknown@example.com',
            createdBy: req.user?._id || null,
          });
          session.escalatedTicketId = ticket._id;
        }
        session.status = 'escalated';
        botReply =
          config.fallbackMessage ||
          "I'm not fully sure about that. I've created a ticket so a human can follow up.";
        source = 'escalation_notice';
      } else {
        botReply =
          config.fallbackMessage ||
          "I'm not fully sure about that. A human will follow up if needed.";
      }
    }

    session.messages.push({
      role: 'bot',
      content: botReply,
      source,
      confidence,
      faqId: null,
    });

    await session.save();

    const responseSession = await ChatSession.findById(session._id)
      .populate('escalatedTicketId', 'ticketNumber status')
      .lean();

    res.json({
      status: 'success',
      data: {
        session: responseSession,
        reply: botReply,
        source,
        confidence,
      },
    });
  } catch (error) {
    next(error);
  }
};

