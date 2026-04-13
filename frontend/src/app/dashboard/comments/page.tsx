'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Trash2, MessageSquare, Calendar } from 'lucide-react';
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
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 280, damping: 24 },
  },
};

interface Comment {
  _id: string;
  content: string;
  author: { _id?: string; name: string; email: string };
  post: { _id: string; title: string };
  status: 'pending' | 'approved' | 'spam' | 'trash';
  createdAt: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  approved: { bg: 'rgba(5,150,105,0.12)', text: 'var(--success)', border: 'rgba(5,150,105,0.3)' },
  spam: { bg: 'rgba(225,29,72,0.12)', text: 'var(--error)', border: 'rgba(225,29,72,0.3)' },
  trash: { bg: 'var(--surface-muted)', text: 'var(--text-muted)', border: 'var(--border)' },
};

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [selectedComments, setSelectedComments] = useState<string[]>([]);

  useEffect(() => {
    fetchComments();
  }, [statusFilter]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const response = await api.get('/comments', { params });
      setComments(response.data.data || response.data);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to fetch comments');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/comments/${id}/approve`);
      toast.success('Comment approved');
      fetchComments();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to approve comment');
    }
  };

  const handleSpam = async (id: string) => {
    try {
      await api.post(`/comments/${id}/spam`);
      toast.success('Comment marked as spam');
      fetchComments();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to mark as spam');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await showConfirm('Delete comment?', 'Are you sure you want to delete this comment?');
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/comments/${id}`);
      toast.success('Comment deleted');
      fetchComments();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to delete comment');
    }
  };

  const handleBulkApprove = async () => {
    if (selectedComments.length === 0) {
      toast.error('No comments selected');
      return;
    }
    try {
      await api.post('/comments/bulk/approve', { commentIds: selectedComments });
      toast.success(`${selectedComments.length} comments approved`);
      setSelectedComments([]);
      fetchComments();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to approve comments');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedComments.length === 0) {
      toast.error('No comments selected');
      return;
    }
    const result = await showConfirm('Delete comments?', `Are you sure you want to delete ${selectedComments.length} comments?`);
    if (!result.isConfirmed) return;
    try {
      await api.post('/comments/bulk/delete', { commentIds: selectedComments });
      toast.success(`${selectedComments.length} comments deleted`);
      setSelectedComments([]);
      fetchComments();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to delete comments');
    }
  };

  const toggleSelectComment = (id: string) => {
    setSelectedComments((prev) => (prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedComments.length === comments.length) {
      setSelectedComments([]);
    } else {
      setSelectedComments(comments.map((c) => c._id));
    }
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
          Loading comments...
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <motion.div
                className="p-2 rounded-xl"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
                whileHover={{ rotate: [0, -8, 8, 0], scale: 1.1 }}
                transition={{ duration: 0.4 }}
              >
                <MessageSquare size={22} style={{ color: 'var(--accent)' }} />
              </motion.div>
              Comments
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Moderate and manage user comments
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border rounded-xl focus:outline-none cursor-pointer min-w-[160px]"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="all">All Comments</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="spam">Spam</option>
            <option value="trash">Trash</option>
          </select>

          <AnimatePresence>
            {selectedComments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3"
              >
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {selectedComments.length} selected
                </span>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleBulkApprove}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm cursor-pointer"
                  style={{ backgroundColor: 'rgba(5,150,105,0.12)', color: 'var(--success)' }}
                >
                  <Check size={18} />
                  Approve All
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm cursor-pointer"
                  style={{ backgroundColor: 'rgba(225,29,72,0.12)', color: 'var(--error)' }}
                >
                  <Trash2 size={18} />
                  Delete All
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {comments.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-16 border rounded-2xl border-dashed"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <MessageSquare size={48} className="mx-auto mb-4 opacity-40" />
            <p className="text-sm">No comments found</p>
          </motion.div>
        ) : (
          <motion.div key="list" variants={stagger} initial="hidden" animate="show" className="space-y-4">
            <motion.div
              variants={fadeUp}
              className="flex items-center gap-3 px-4 py-2 border rounded-xl"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <input
                type="checkbox"
                checked={selectedComments.length === comments.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded cursor-pointer"
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Select All
              </span>
            </motion.div>

            {comments.map((comment) => (
              <motion.div
                key={comment._id}
                variants={fadeUp}
                whileHover={{ y: -2, transition: { type: 'spring' as const, stiffness: 400, damping: 20 } }}
                whileTap={{ scale: 0.995 }}
                className="border rounded-xl p-6"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={selectedComments.includes(comment._id)}
                    onChange={() => toggleSelectComment(comment._id)}
                    className="mt-1 w-4 h-4 rounded cursor-pointer"
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{comment.author.name}</span>
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-medium border"
                            style={{
                              backgroundColor: STATUS_STYLES[comment.status]?.bg || 'var(--surface-muted)',
                              color: STATUS_STYLES[comment.status]?.text || 'var(--text-muted)',
                              borderColor: STATUS_STYLES[comment.status]?.border || 'var(--border)',
                            }}
                          >
                            {comment.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }} suppressHydrationWarning>
                          <span>On: {comment.post.title}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>{comment.content}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {comment.status === 'pending' && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleApprove(comment._id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
                          style={{ backgroundColor: 'rgba(5,150,105,0.12)', color: 'var(--success)' }}
                        >
                          <Check size={14} />
                          Approve
                        </motion.button>
                      )}
                      {comment.status !== 'spam' && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleSpam(comment._id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
                          style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}
                        >
                          <X size={14} />
                          Spam
                        </motion.button>
                      )}
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleDelete(comment._id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
                        style={{ backgroundColor: 'rgba(225,29,72,0.12)', color: 'var(--error)' }}
                      >
                        <Trash2 size={14} />
                        Delete
                      </motion.button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
