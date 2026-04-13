'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, Plus, Search, ChevronDown, ChevronUp, Trash2, Edit, Check, GripVertical } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { showConfirm } from '@/lib/sweetalert';

/* ═══════════════════════════════════════════════════════════════
   ANIMATION PRIMITIVES
   ═══════════════════════════════════════════════════════════════ */

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03, delayChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 280, damping: 24 },
  },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: {
    opacity: 1, scale: 1,
    transition: { type: 'spring' as const, stiffness: 320, damping: 26 },
  },
  exit: { opacity: 0, scale: 0.92, transition: { duration: 0.15 } },
};

interface FAQ {
  _id: string;
  question: string;
  answer: string;
  category: string;
  service?: string;
  order: number;
  isActive: boolean;
}

const EMPTY_FORM = { question: '', answer: '', category: 'General', service: '', isActive: true };

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FAQ | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchFAQs = useCallback(async (bustCache = false) => {
    try {
      const url = bustCache ? `/faq?_=${Date.now()}` : '/faq';
      const { data } = await api.get(url);
      setFaqs(data?.data?.faqs ?? []);
    } catch {
      toast.error('Failed to load FAQs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFAQs();
  }, [fetchFAQs]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (faq: FAQ) => {
    setEditing(faq);
    setForm({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      service: faq.service || '',
      isActive: faq.isActive,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const { data } = await api.patch(`/faq/${editing._id}`, form);
        const updated = data?.data?.faq;
        if (updated) {
          setFaqs((prev) => prev.map((f) => (f._id === updated._id ? updated : f)));
        }
        toast.success('FAQ updated');
      } else {
        const { data } = await api.post('/faq', form);
        const created = data?.data?.faq;
        if (created) {
          setFaqs((prev) => [...prev, created]);
        }
        toast.success('FAQ created');
      }
      setShowModal(false);
      await fetchFAQs(true);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (faq: FAQ) => {
    try {
      await api.patch(`/faq/${faq._id}`, { isActive: !faq.isActive });
      setFaqs((prev) => prev.map((f) => (f._id === faq._id ? { ...f, isActive: !f.isActive } : f)));
    } catch {
      toast.error('Failed');
    }
  };

  const deleteFAQ = async (id: string) => {
    const result = await showConfirm('Delete FAQ?', 'This will permanently delete this FAQ item.');
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/faq/${id}`);
      setFaqs((prev) => prev.filter((f) => f._id !== id));
      toast.success('Deleted');
    } catch {
      toast.error('Failed');
    }
  };

  const categories = Array.from(new Set(faqs.map((f) => f.category)));
  const filtered = faqs.filter(
    (f) =>
      f.question.toLowerCase().includes(search.toLowerCase()) ||
      f.answer.toLowerCase().includes(search.toLowerCase()) ||
      f.category.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ backgroundColor: 'var(--bg)' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-t-transparent rounded-full"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
        />
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Loading FAQs...
        </motion.p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="p-6 min-h-screen"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text-primary)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring' as const, stiffness: 260, damping: 24 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <motion.div
              className="p-2 rounded-xl"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
              whileHover={{ rotate: [0, -8, 8, 0], scale: 1.1 }}
              transition={{ duration: 0.4 }}
            >
              <HelpCircle size={22} style={{ color: 'var(--accent)' }} />
            </motion.div>
            FAQ Management
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {faqs.length} FAQ entries • {faqs.filter((f) => f.isActive).length} active
          </p>
        </div>
        <motion.button
          onClick={openCreate}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm cursor-pointer text-white"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Plus size={16} />
          Add FAQ
        </motion.button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex gap-2 mb-5 flex-wrap"
      >
        <motion.button
          onClick={() => setSearch('')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all border cursor-pointer"
          style={
            !search
              ? { backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-text)', borderColor: 'var(--accent-border)' }
              : { backgroundColor: 'var(--surface)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
          }
        >
          All ({faqs.length})
        </motion.button>
        {categories.map((cat) => (
          <motion.button
            key={cat}
            onClick={() => setSearch(cat)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all border cursor-pointer"
            style={
              search === cat
                ? { backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-text)', borderColor: 'var(--accent-border)' }
                : { backgroundColor: 'var(--surface)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
            }
          >
            {cat} ({faqs.filter((f) => f.category === cat).length})
          </motion.button>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search FAQs…"
          className="w-full pl-10 pr-4 py-3 border rounded-xl text-sm placeholder-gray-500 focus:outline-none"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
      </motion.div>

      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
        {filtered.map((faq, idx) => (
          <motion.div
            key={faq._id}
            variants={fadeUp}
            layout
            className={`border rounded-xl overflow-hidden transition-all ${!faq.isActive ? 'opacity-50' : ''}`}
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: expanded === faq._id ? 'var(--accent-border)' : 'var(--border)',
            }}
          >
            <div
              className="flex items-start gap-3 p-4 cursor-pointer"
              onClick={() => setExpanded(expanded === faq._id ? null : faq._id)}
            >
              <div className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                <GripVertical size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-text)' }}
                  >
                    {faq.category}
                  </span>
                  {faq.service && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {faq.service}
                    </span>
                  )}
                  {!faq.isActive && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)' }}
                    >
                      Disabled
                    </span>
                  )}
                </div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {faq.question}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(faq);
                  }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-1.5 rounded-lg cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Edit size={13} />
                </motion.button>
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleActive(faq);
                  }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-1.5 rounded-lg cursor-pointer"
                  style={{ color: faq.isActive ? 'var(--success)' : 'var(--text-muted)' }}
                >
                  <Check size={13} />
                </motion.button>
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFAQ(faq._id);
                  }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-1.5 rounded-lg cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Trash2 size={13} />
                </motion.button>
                {expanded === faq._id ? (
                  <ChevronUp size={14} style={{ color: 'var(--accent)' }} />
                ) : (
                  <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
                )}
              </div>
            </div>
            <AnimatePresence>
              {expanded === faq._id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring' as const, stiffness: 300, damping: 30 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-0 border-t" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-sm pt-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {faq.answer}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16 border rounded-2xl border-dashed"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <HelpCircle size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No FAQs found. Add your first FAQ!</p>
          </motion.div>
        )}
      </motion.div>

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
          >
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              className="border rounded-2xl p-6 w-full max-w-lg"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
                <HelpCircle size={20} style={{ color: 'var(--accent)' }} />
                {editing ? 'Edit FAQ' : 'Add FAQ'}
              </h2>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Question
                  </label>
                  <input
                    value={form.question}
                    onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))}
                    required
                    placeholder="e.g. What services do you offer?"
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Answer
                  </label>
                  <textarea
                    value={form.answer}
                    onChange={(e) => setForm((p) => ({ ...p, answer: e.target.value }))}
                    required
                    rows={4}
                    placeholder="Provide a clear and comprehensive answer…"
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none resize-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Category
                    </label>
                    <input
                      value={form.category}
                      onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                      required
                      placeholder="General"
                      className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Service (optional)
                    </label>
                    <input
                      value={form.service}
                      onChange={(e) => setForm((p) => ({ ...p, service: e.target.value }))}
                      placeholder="e.g. Immigration"
                      className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
                    className="w-10 h-5 rounded-full transition-all relative"
                    style={{ backgroundColor: form.isActive ? 'var(--accent)' : 'var(--surface-muted)' }}
                  >
                    <motion.span
                      layout
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white"
                      animate={{ left: form.isActive ? 20 : 2 }}
                      transition={{ type: 'spring' as const, stiffness: 400, damping: 28 }}
                    />
                  </div>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Active
                  </span>
                </label>
                <div className="flex gap-3 pt-2">
                  <motion.button
                    type="button"
                    onClick={() => setShowModal(false)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 py-2.5 border rounded-xl text-sm cursor-pointer"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    disabled={saving}
                    whileHover={{ scale: saving ? 1 : 1.02 }}
                    whileTap={{ scale: saving ? 1 : 0.98 }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 text-white"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {saving ? 'Saving…' : editing ? 'Update FAQ' : 'Add FAQ'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
