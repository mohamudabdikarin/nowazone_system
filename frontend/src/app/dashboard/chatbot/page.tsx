'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  Filter,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { showConfirm } from '@/lib/sweetalert';

type ChatRole = 'user' | 'bot' | 'agent';
type ChatSource = 'faq' | 'fallback' | 'escalation_notice' | 'system';

interface ChatMessage {
  _id?: string;
  role: ChatRole;
  content: string;
  source: ChatSource;
  confidence?: number;
  createdAt?: string;
}

interface EscalatedTicketRef {
  _id: string;
  ticketNumber: string;
  status: string;
}

interface ChatSession {
  _id: string;
  user?: { _id: string; name: string; email: string };
  channel: 'dashboard' | 'widget' | 'api';
  status: 'open' | 'escalated' | 'resolved' | 'closed';
  escalatedTicketId?: EscalatedTicketRef | null;
  messages: ChatMessage[];
  createdAt: string;
}

interface ChatbotFaq {
  _id: string;
  question: string;
  answer: string;
  tags?: string[];
  category?: string;
  isActive: boolean;
  order: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface ChatbotConfig {
  _id: string;
  name: string;
  isActive: boolean;
  greetingMessage: string;
  fallbackMessage: string;
  escalationEnabled: boolean;
  escalationTicketCategory: 'technical' | 'billing' | 'general' | 'feature_request' | 'bug';
  escalationPriority: 'low' | 'medium' | 'high' | 'critical';
  minConfidence: number;
  temperature: number;
  tone: 'neutral' | 'friendly' | 'formal';
}

type TabKey = 'chat' | 'faq' | 'settings';

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
};

function isAxiosError(error: unknown): error is { response?: { data?: { message?: string } } } {
  return typeof error === 'object' && error !== null && 'response' in error;
}

export default function ChatbotPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('chat');

  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  const [config, setConfig] = useState<ChatbotConfig | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  const [session, setSession] = useState<ChatSession | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [faqs, setFaqs] = useState<ChatbotFaq[]>([]);
  const [faqPagination, setFaqPagination] = useState<Pagination | null>(null);
  const [faqSearch, setFaqSearch] = useState('');
  const [faqCategory, setFaqCategory] = useState('');
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqError, setFaqError] = useState<string | null>(null);

  const [faqForm, setFaqForm] = useState<{ id?: string; question: string; answer: string; tags: string; category: string; isActive: boolean }>({
    question: '',
    answer: '',
    tags: '',
    category: '',
    isActive: true,
  });
  const [faqSaving, setFaqSaving] = useState(false);

  const loadInitial = useCallback(async () => {
    setInitialError(null);
    try {
      const [configRes, faqRes] = await Promise.all([
        api.get('/chatbot/config'),
        api.get('/chatbot/faqs', { params: { page: 1, limit: 20 } }),
      ]);

      setConfig(configRes.data.data.config as ChatbotConfig);

      const faqsData = faqRes.data.data as { faqs: ChatbotFaq[]; pagination: Pagination };
      setFaqs(faqsData.faqs);
      setFaqPagination(faqsData.pagination);
    } catch (error) {
      const message = isAxiosError(error) && error.response?.data?.message
        ? error.response.data.message
        : 'Failed to load chatbot data';
      setInitialError(message);
      toast.error(message);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadFaqs = useCallback(
    async (page: number = 1) => {
      setFaqLoading(true);
      setFaqError(null);
      try {
        const params: Record<string, string | number> = { page, limit: 20 };
        if (faqSearch.trim()) params.search = faqSearch.trim();
        if (faqCategory) params.category = faqCategory;
        const { data } = await api.get('/chatbot/faqs', { params });
        const faqsData = data.data as { faqs: ChatbotFaq[]; pagination: Pagination };
        setFaqs(faqsData.faqs);
        setFaqPagination(faqsData.pagination);
      } catch (error) {
        const message = isAxiosError(error) && error.response?.data?.message
          ? error.response.data.message
          : 'Failed to load FAQs';
        setFaqError(message);
        toast.error(message);
      } finally {
        setFaqLoading(false);
      }
    },
    [faqSearch, faqCategory]
  );

  const handleSend = async () => {
    if (!chatInput.trim() || sending) return;
    setSending(true);
    setChatError(null);
    try {
      const payload: { message: string; sessionId?: string } = {
        message: chatInput.trim(),
      };
      if (session?._id) {
        payload.sessionId = session._id;
      }

      const { data } = await api.post('/chatbot/chat', payload);
      const updated = data.data.session as ChatSession;
      setSession(updated);
      setChatInput('');
    } catch (error) {
      const message = isAxiosError(error) && error.response?.data?.message
        ? error.response.data.message
        : 'Failed to send message';
      setChatError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const handleFaqSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!faqForm.question.trim() || !faqForm.answer.trim()) return;

    setFaqSaving(true);
    try {
      const payload = {
        question: faqForm.question.trim(),
        answer: faqForm.answer.trim(),
        category: faqForm.category.trim() || undefined,
        tags: faqForm.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
        isActive: faqForm.isActive,
      };

      if (faqForm.id) {
        await api.patch(`/chatbot/faqs/${faqForm.id}`, payload);
        toast.success('FAQ updated');
      } else {
        await api.post('/chatbot/faqs', payload);
        toast.success('FAQ created');
      }

      setFaqForm({
        question: '',
        answer: '',
        tags: '',
        category: '',
        isActive: true,
      });
      await loadFaqs(faqPagination?.page || 1);
    } catch (error) {
      const message = isAxiosError(error) && error.response?.data?.message
        ? error.response.data.message
        : 'Failed to save FAQ';
      toast.error(message);
    } finally {
      setFaqSaving(false);
    }
  };

  const handleFaqEdit = (faq: ChatbotFaq) => {
    setFaqForm({
      id: faq._id,
      question: faq.question,
      answer: faq.answer,
      category: faq.category || '',
      tags: (faq.tags || []).join(', '),
      isActive: faq.isActive,
    });
  };

  const handleFaqDelete = async (id: string) => {
    const result = await showConfirm('Delete FAQ?', 'This will permanently delete this chatbot FAQ item.');
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/chatbot/faqs/${id}`);
      toast.success('FAQ deleted');
      await loadFaqs(faqPagination?.page || 1);
    } catch (error) {
      const message = isAxiosError(error) && error.response?.data?.message
        ? error.response.data.message
        : 'Failed to delete FAQ';
      toast.error(message);
    }
  };

  const handleConfigSave = async () => {
    if (!config || configSaving) return;
    setConfigSaving(true);
    try {
      const payload = {
        name: config.name,
        isActive: config.isActive,
        greetingMessage: config.greetingMessage,
        fallbackMessage: config.fallbackMessage,
        escalationEnabled: config.escalationEnabled,
        escalationTicketCategory: config.escalationTicketCategory,
        escalationPriority: config.escalationPriority,
        minConfidence: config.minConfidence,
        temperature: config.temperature,
        tone: config.tone,
      };
      const { data } = await api.put('/chatbot/config', payload);
      setConfig(data.data.config as ChatbotConfig);
      toast.success('Chatbot settings saved');
    } catch (error) {
      const message = isAxiosError(error) && error.response?.data?.message
        ? error.response.data.message
        : 'Failed to save settings';
      toast.error(message);
    } finally {
      setConfigSaving(false);
    }
  };

  const activeMessages = useMemo(() => {
    if (!session) return [];
    return session.messages;
  }, [session]);

  if (initialLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ backgroundColor: 'var(--bg)' }}
      >
        <div className="flex flex-col items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-10 h-10 rounded-full border-4 border-t-transparent"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Loading chatbot workspace…
          </p>
        </div>
      </div>
    );
  }

  if (initialError) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ backgroundColor: 'var(--bg)' }}
      >
        <div
          className="border rounded-2xl px-6 py-5 max-w-md text-center"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--error-border, var(--border))' }}
        >
          <TriangleAlert
            className="mx-auto mb-3"
            size={26}
            style={{ color: 'var(--error)' }}
          />
          <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Failed to load chatbot
          </p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            {initialError}
          </p>
          <button
            type="button"
            onClick={() => {
              setInitialLoading(true);
              void loadInitial();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--button-on-accent, #fff)' }}
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="p-6 min-h-screen"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text-primary)' }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <motion.div
              className="p-2 rounded-xl"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
              whileHover={{ rotate: [0, -6, 6, 0], scale: 1.05 }}
              transition={{ duration: 0.4 }}
            >
              <Bot size={22} style={{ color: 'var(--accent)' }} />
            </motion.div>
            Chatbot Management
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Train FAQs, tune behaviour, and review escalated conversations.
          </p>
        </div>
      </div>

      <div className="border-b mb-4 flex gap-3" style={{ borderColor: 'var(--border)' }}>
        {[
          { key: 'chat' as TabKey, label: 'Chat', Icon: MessageCircle },
          { key: 'faq' as TabKey, label: 'FAQ Training', Icon: Sparkles },
          { key: 'settings' as TabKey, label: 'Tuning & Escalation', Icon: Settings2 },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className="relative px-3 py-2 text-sm font-medium flex items-center gap-2 cursor-pointer border-b-2"
              style={{
                borderColor: isActive ? 'var(--accent)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                backgroundColor: 'transparent',
              }}
            >
              <tab.Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          className="lg:col-span-2 border rounded-2xl flex flex-col min-h-[420px]"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {activeTab === 'chat' && (
            <>
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} style={{ color: 'var(--accent)' }} />
                  <span className="text-sm font-semibold">Assistant Console</span>
                </div>
                {session?.escalatedTicketId && (
                  <div className="text-xs rounded-full px-3 py-1 flex items-center gap-1.5"
                    style={{ backgroundColor: 'var(--warning-subtle)', color: 'var(--warning)' }}
                  >
                    <TriangleAlert size={12} />
                    Escalated to ticket {session.escalatedTicketId.ticketNumber}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {activeMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-40 text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Bot className="mb-2 opacity-50" size={32} />
                    <p>Start typing below to begin a conversation with your assistant.</p>
                  </div>
                )}
                {activeMessages.map((msg) => (
                  <div
                    key={msg._id || `${msg.role}-${msg.createdAt}-${msg.content.slice(0, 12)}`}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className="max-w-[80%] rounded-2xl px-3 py-2 text-sm"
                      style={
                        msg.role === 'user'
                          ? {
                              backgroundColor: 'var(--accent-subtle)',
                              borderColor: 'var(--accent-border)',
                              borderWidth: 1,
                              borderStyle: 'solid',
                            }
                          : { backgroundColor: 'var(--bg)' }
                      }
                    >
                      <p className="font-semibold mb-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {msg.role === 'user' ? 'You' : 'Assistant'}
                        {msg.source === 'faq' && ' · FAQ match'}
                        {msg.source === 'escalation_notice' && ' · Escalated'}
                      </p>
                      <p>{msg.content}</p>
                      {typeof msg.confidence === 'number' && msg.source !== 'system' && (
                        <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          Confidence {(msg.confidence * 100).toFixed(0)}%
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="px-4 py-3 border-t flex flex-col gap-2"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
              >
                {chatError && (
                  <div
                    className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-2"
                    style={{ backgroundColor: 'var(--error-subtle)', color: 'var(--error)' }}
                  >
                    <TriangleAlert size={12} />
                    <span>{chatError}</span>
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <textarea
                    rows={2}
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder={config?.greetingMessage || 'Ask a question…'}
                    className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none resize-none"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderColor: 'var(--border)',
                      borderWidth: 1,
                      borderStyle: 'solid',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <motion.button
                    type="button"
                    whileHover={{ scale: chatInput.trim() ? 1.04 : 1 }}
                    whileTap={{ scale: chatInput.trim() ? 0.97 : 1 }}
                    disabled={!chatInput.trim() || sending}
                    onClick={() => void handleSend()}
                    className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-40 flex items-center gap-2"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--button-on-accent, #fff)' }}
                  >
                    <MessageCircle size={14} />
                    {sending ? 'Sending…' : 'Send'}
                  </motion.button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'faq' && (
            <>
              <div
                className="flex items-center justify-between px-4 py-3 border-b gap-2 flex-wrap"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                  <span className="text-sm font-semibold">FAQ Training</span>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-muted)' }}
                    />
                    <input
                      value={faqSearch}
                      onChange={(event) => setFaqSearch(event.target.value)}
                      placeholder="Search FAQs…"
                      className="pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none"
                      style={{
                        backgroundColor: 'var(--bg)',
                        borderColor: 'var(--border)',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadFaqs(1)}
                    className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                    style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderWidth: 1, borderStyle: 'solid', color: 'var(--text-secondary)' }}
                  >
                    <Filter size={12} />
                    Apply
                  </button>
                </div>
              </div>

              <div
                className="px-4 py-3 text-xs rounded-lg mx-4 mt-2"
                style={{ backgroundColor: 'var(--surface)', color: 'var(--text-secondary)', borderColor: 'var(--border)', borderWidth: 1, borderStyle: 'solid' }}
              >
                <p className="font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>About FAQ training</p>
                <p className="mb-1">This page trains the website chatbot. FAQs you add here are used by the AI to answer visitors.</p>
                <p className="mb-0"><strong>Recommended:</strong> Keep questions short and specific; add tags for synonyms; keep answers concise; add links to docs or tickets when relevant; review escalated chats regularly to add new FAQs and reduce manual workload.</p>
              </div>

              <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-0">
                <div className="border-r min-h-[260px]" style={{ borderColor: 'var(--border)' }}>
                  <div className="p-4 space-y-2">
                    {faqLoading && (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <div
                            key={index}
                            className="rounded-lg h-12 animate-pulse"
                            style={{ backgroundColor: 'var(--skeleton, rgba(255,255,255,0.04))' }}
                          />
                        ))}
                      </div>
                    )}
                    {!faqLoading && faqs.length === 0 && !faqError && (
                      <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>
                        No FAQs yet. Add your first question on the right.
                      </p>
                    )}
                    {faqError && (
                      <div
                        className="text-xs px-3 py-2 rounded-lg flex items-center justify-between gap-2"
                        style={{ backgroundColor: 'var(--error-subtle)', color: 'var(--error)' }}
                      >
                        <span>{faqError}</span>
                        <button
                          type="button"
                          className="text-[11px] underline cursor-pointer"
                          onClick={() => void loadFaqs(faqPagination?.page || 1)}
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    {!faqLoading &&
                      faqs.map((faq) => (
                        <button
                          key={faq._id}
                          type="button"
                          onClick={() => handleFaqEdit(faq)}
                          className="w-full text-left px-3 py-2 rounded-lg border cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg)',
                            borderColor: 'var(--border)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <p className="text-xs font-semibold mb-0.5">{faq.question}</p>
                          <p
                            className="text-[11px] truncate"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {faq.answer}
                          </p>
                        </button>
                      ))}
                  </div>
                  {faqPagination && faqPagination.pages > 1 && (
                    <div
                      className="flex items-center justify-between px-4 py-2 border-t text-xs"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      <span>
                        Page {faqPagination.page} of {faqPagination.pages}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={faqPagination.page <= 1}
                          onClick={() => void loadFaqs(faqPagination.page - 1)}
                          className="px-2 py-1 rounded border text-[11px] cursor-pointer disabled:opacity-40"
                          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          disabled={faqPagination.page >= faqPagination.pages}
                          onClick={() => void loadFaqs(faqPagination.page + 1)}
                          className="px-2 py-1 rounded border text-[11px] cursor-pointer disabled:opacity-40"
                          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <form onSubmit={handleFaqSubmit} className="space-y-3">
                    <div>
                      <label
                        className="block text-xs font-semibold mb-1"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Question
                      </label>
                      <input
                        value={faqForm.question}
                        onChange={(event) =>
                          setFaqForm((previous) => ({ ...previous, question: event.target.value }))
                        }
                        required
                        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                        style={{
                          backgroundColor: 'var(--bg)',
                          borderColor: 'var(--border)',
                          borderWidth: 1,
                          borderStyle: 'solid',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>
                    <div>
                      <label
                        className="block text-xs font-semibold mb-1"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Answer
                      </label>
                      <textarea
                        value={faqForm.answer}
                        onChange={(event) =>
                          setFaqForm((previous) => ({ ...previous, answer: event.target.value }))
                        }
                        required
                        rows={4}
                        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-none"
                        style={{
                          backgroundColor: 'var(--bg)',
                          borderColor: 'var(--border)',
                          borderWidth: 1,
                          borderStyle: 'solid',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          className="block text-xs font-semibold mb-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Category
                        </label>
                        <input
                          value={faqForm.category}
                          onChange={(event) =>
                            setFaqForm((previous) => ({ ...previous, category: event.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                          style={{
                            backgroundColor: 'var(--bg)',
                            borderColor: 'var(--border)',
                            borderWidth: 1,
                            borderStyle: 'solid',
                            color: 'var(--text-primary)',
                          }}
                        />
                      </div>
                      <div>
                        <label
                          className="block text-xs font-semibold mb-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Tags (comma separated)
                        </label>
                        <input
                          value={faqForm.tags}
                          onChange={(event) =>
                            setFaqForm((previous) => ({ ...previous, tags: event.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                          style={{
                            backgroundColor: 'var(--bg)',
                            borderColor: 'var(--border)',
                            borderWidth: 1,
                            borderStyle: 'solid',
                            color: 'var(--text-primary)',
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={faqForm.isActive}
                          onChange={(event) =>
                            setFaqForm((previous) => ({ ...previous, isActive: event.target.checked }))
                          }
                        />
                        <span style={{ color: 'var(--text-secondary)' }}>Active</span>
                      </label>
                      <div className="flex gap-2">
                        {faqForm.id && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!faqForm.id) return;
                              void handleFaqDelete(faqForm.id);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                            style={{
                              backgroundColor: 'var(--error-subtle)',
                              color: 'var(--error)',
                            }}
                          >
                            Delete
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={faqSaving}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1"
                          style={{
                            backgroundColor: 'var(--accent)',
                            color: 'var(--button-on-accent, #fff)',
                          }}
                        >
                          <Save size={12} />
                          {faqSaving ? 'Saving…' : faqForm.id ? 'Update FAQ' : 'Add FAQ'}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </>
          )}

          {activeTab === 'settings' && config && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-xs font-semibold mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Assistant name
                  </label>
                  <input
                    value={config.name}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous ? { ...previous, name: event.target.value } : previous
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{
                      backgroundColor: 'var(--bg)',
                      borderColor: 'var(--border)',
                      borderWidth: 1,
                      borderStyle: 'solid',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 mt-5 md:mt-0">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={config.isActive}
                      onChange={(event) =>
                        setConfig((previous) =>
                          previous ? { ...previous, isActive: event.target.checked } : previous
                        )
                      }
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>Bot is active</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-xs font-semibold mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Greeting message
                  </label>
                  <textarea
                    rows={2}
                    value={config.greetingMessage}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous ? { ...previous, greetingMessage: event.target.value } : previous
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-none"
                    style={{
                      backgroundColor: 'var(--bg)',
                      borderColor: 'var(--border)',
                      borderWidth: 1,
                      borderStyle: 'solid',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Fallback message
                  </label>
                  <textarea
                    rows={2}
                    value={config.fallbackMessage}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous ? { ...previous, fallbackMessage: event.target.value } : previous
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-none"
                    style={{
                      backgroundColor: 'var(--bg)',
                      borderColor: 'var(--border)',
                      borderWidth: 1,
                      borderStyle: 'solid',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label
                    className="block text-xs font-semibold mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Minimum FAQ confidence
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.minConfidence}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous
                          ? { ...previous, minConfidence: Number(event.target.value) || 0 }
                          : previous
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{
                      backgroundColor: 'var(--bg)',
                      borderColor: 'var(--border)',
                      borderWidth: 1,
                      borderStyle: 'solid',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Tone
                  </label>
                  <select
                    value={config.tone}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous
                          ? { ...previous, tone: event.target.value as ChatbotConfig['tone'] }
                          : previous
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{
                      backgroundColor: 'var(--bg)',
                      borderColor: 'var(--border)',
                      borderWidth: 1,
                      borderStyle: 'solid',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="friendly">Friendly</option>
                    <option value="neutral">Neutral</option>
                    <option value="formal">Formal</option>
                  </select>
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Creativity (temperature)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.temperature}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous
                          ? { ...previous, temperature: Number(event.target.value) || 0 }
                          : previous
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{
                      backgroundColor: 'var(--bg)',
                      borderColor: 'var(--border)',
                      borderWidth: 1,
                      borderStyle: 'solid',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <div className="border rounded-xl p-3 mt-1" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TriangleAlert
                      size={14}
                      style={{ color: 'var(--warning)' }}
                    />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      Escalation rules
                    </span>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={config.escalationEnabled}
                      onChange={(event) =>
                        setConfig((previous) =>
                          previous
                            ? { ...previous, escalationEnabled: event.target.checked }
                            : previous
                        )
                      }
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>Escalate low-confidence chats</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                  <div>
                    <label
                      className="block text-xs font-semibold mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Ticket category
                    </label>
                    <select
                      value={config.escalationTicketCategory}
                      onChange={(event) =>
                        setConfig((previous) =>
                          previous
                            ? {
                                ...previous,
                                escalationTicketCategory: event.target
                                  .value as ChatbotConfig['escalationTicketCategory'],
                              }
                            : previous
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                      style={{
                        backgroundColor: 'var(--bg)',
                        borderColor: 'var(--border)',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="general">General</option>
                      <option value="technical">Technical</option>
                      <option value="billing">Billing</option>
                      <option value="feature_request">Feature request</option>
                      <option value="bug">Bug</option>
                    </select>
                  </div>
                  <div>
                    <label
                      className="block text-xs font-semibold mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Ticket priority
                    </label>
                    <select
                      value={config.escalationPriority}
                      onChange={(event) =>
                        setConfig((previous) =>
                          previous
                            ? {
                                ...previous,
                                escalationPriority: event.target
                                  .value as ChatbotConfig['escalationPriority'],
                              }
                            : previous
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                      style={{
                        backgroundColor: 'var(--bg)',
                        borderColor: 'var(--border)',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={configSaving}
                  onClick={() => void handleConfigSave()}
                  className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--button-on-accent, #fff)' }}
                >
                  <Save size={14} />
                  {configSaving ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            </div>
          )}
        </motion.div>

        <AnimatePresence>
          <motion.div
            className="border rounded-2xl p-4 h-full"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Settings2 size={16} style={{ color: 'var(--accent)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Assistant health
              </span>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Train clear FAQs for the most common questions. Low-confidence matches will be escalated
              to support according to your rules.
            </p>
            <ul className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
              <li>
                • Make questions short and specific; use tags for synonyms.
              </li>
              <li>
                • Keep answers concise. Link to internal docs or tickets when needed.
              </li>
              <li>
                • Review escalated chats regularly to add new FAQs and reduce manual workload.
              </li>
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

