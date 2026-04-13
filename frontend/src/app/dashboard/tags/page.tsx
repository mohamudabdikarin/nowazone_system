'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit, Trash2, Tag as TagIcon, Hash } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { showConfirm } from '@/lib/sweetalert';

/* ═══════════════════════════════════════════════════════════════
   ANIMATION PRIMITIVES
   ═══════════════════════════════════════════════════════════════ */

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
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

interface Tag {
  _id: string;
  name: string;
  slug: string;
  color?: string;
  postCount: number;
}

const colorOptions = ['#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#3b82f6', '#14b8a6'];

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [formData, setFormData] = useState({ name: '', color: colorOptions[0] });

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      setLoading(true);
      const response = await api.get('/tags');
      setTags(response.data.data || response.data);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to fetch tags');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('Tag name is required');
      return;
    }
    try {
      if (editingTag) {
        await api.put(`/tags/${editingTag._id}`, formData);
        toast.success('Tag updated successfully');
      } else {
        await api.post('/tags', formData);
        toast.success('Tag created successfully');
      }
      setShowModal(false);
      setEditingTag(null);
      setFormData({ name: '', color: colorOptions[0] });
      fetchTags();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to save tag');
    }
  };

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    setFormData({ name: tag.name, color: tag.color || colorOptions[0] });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    const result = await showConfirm('Delete tag?', 'Are you sure you want to delete this tag?');
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/tags/${id}`);
      toast.success('Tag deleted successfully');
      fetchTags();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to delete tag');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTag(null);
    setFormData({ name: '', color: colorOptions[0] });
  };

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
          Loading tags...
        </motion.p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen p-6"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text-primary)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring' as const, stiffness: 260, damping: 24 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <motion.div
                className="p-2 rounded-xl"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
                whileHover={{ rotate: [0, -8, 8, 0], scale: 1.1 }}
                transition={{ duration: 0.4 }}
              >
                <TagIcon size={22} style={{ color: 'var(--accent)' }} />
              </motion.div>
              Tags
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Label and categorize your content
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm cursor-pointer text-white"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Plus size={18} />
            New Tag
          </motion.button>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {tags.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-16 border rounded-2xl border-dashed"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <Hash size={48} className="mx-auto mb-4 opacity-40" />
            <p className="text-sm">No tags yet. Create your first one!</p>
          </motion.div>
        ) : (
          <motion.div key="list" variants={stagger} initial="hidden" animate="show" className="flex flex-wrap gap-3">
            {tags.map((tag) => (
              <motion.div key={tag._id} variants={fadeUp} className="group relative">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: `${tag.color}15`,
                    borderColor: `${tag.color}40`,
                    color: tag.color,
                  }}
                >
                  <TagIcon size={14} />
                  <span className="font-medium">{tag.name}</span>
                  <span className="text-xs opacity-60">({tag.postCount || 0})</span>
                </motion.div>
                <div className="absolute -top-2 -right-2 hidden group-hover:flex items-center gap-1">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleEdit(tag)}
                    className="p-1.5 rounded-full shadow-lg text-white cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    <Edit size={12} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleDelete(tag._id)}
                    className="p-1.5 rounded-full shadow-lg cursor-pointer"
                    style={{ backgroundColor: 'var(--error)' }}
                  >
                    <Trash2 size={12} />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && handleCloseModal()}
          >
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              className="border rounded-xl p-6 w-full max-w-md"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <h2 className="text-xl font-bold mb-6">{editingTag ? 'Edit Tag' : 'New Tag'}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Name <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Tag name"
                    className="w-full px-4 py-2.5 border rounded-xl placeholder-gray-500 focus:outline-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Color
                  </label>
                  <div className="grid grid-cols-8 gap-2">
                    {colorOptions.map((color) => (
                      <motion.button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.95 }}
                        className={`w-10 h-10 rounded-lg transition-all cursor-pointer ${formData.color === color ? 'ring-2 ring-offset-2 ring-[var(--accent)]' : ''}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Preview
                  </label>
                  <div
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border-2"
                    style={{
                      backgroundColor: `${formData.color}15`,
                      borderColor: `${formData.color}40`,
                      color: formData.color,
                    }}
                  >
                    <TagIcon size={14} />
                    <span className="font-medium">{formData.name || 'Tag Name'}</span>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <motion.button
                    type="button"
                    onClick={handleCloseModal}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 px-4 py-2.5 rounded-xl font-semibold transition-colors cursor-pointer"
                    style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 px-4 py-2.5 rounded-xl font-semibold transition-colors text-white cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {editingTag ? 'Update' : 'Create'}
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
