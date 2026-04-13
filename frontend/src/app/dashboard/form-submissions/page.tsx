'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Search, RefreshCw, Eye, Mail, CheckCircle,
  Archive, X, Calendar, Filter, ChevronDown, Clock,
  MessageSquare, ClipboardList, Download as DownloadIcon, Phone,
  Building2, Globe, ExternalLink, Trash2,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { useUserProfile, hasPermission } from '@/hooks/useUserProfile';
import { showConfirm } from '@/lib/sweetalert';

interface FormSubmission {
  _id: string;
  type: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message?: string;
  formData?: Record<string, unknown>;
  source: string;
  page?: string;
  status: string;
  leadId?: { _id: string; name: string; email: string; status: string };
  respondedBy?: { _id: string; name: string; email: string };
  respondedAt?: string;
  createdAt: string;
}

interface FormStats {
  total: number;
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: typeof FileText }> = {
  contact:     { label: 'Contact',     color: 'var(--accent)',  bg: 'var(--accent-subtle)',  Icon: MessageSquare },
  assessment:  { label: 'Assessment',  color: 'var(--warning)', bg: 'var(--warning-subtle)', Icon: ClipboardList },
  appointment: { label: 'Appointment', color: 'var(--success)', bg: 'var(--success-subtle)', Icon: Calendar },
  download:    { label: 'Download',    color: 'var(--info)',    bg: 'var(--info-subtle)',    Icon: DownloadIcon },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'New',       color: 'var(--accent)',    bg: 'var(--accent-subtle)' },
  read:      { label: 'Read',      color: 'var(--text-muted)', bg: 'var(--surface-muted)' },
  responded: { label: 'Responded', color: 'var(--success)',   bg: 'var(--success-subtle)' },
  archived:  { label: 'Archived',  color: 'var(--text-muted)', bg: 'var(--surface-muted)' },
};

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

export default function FormSubmissionsPage() {
  const { user } = useUserProfile();
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<FormStats>({ total: 0, byType: [], byStatus: [] });
  const [selected, setSelected] = useState<FormSubmission | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const canDeleteSubmission = hasPermission(user, 'forms.delete') || hasPermission(user, 'crm.write');

  const getStatCount = (arr: { type?: string; status?: string; count: number }[], key: string) =>
    arr.find((s) => (s.type || s.status) === key)?.count ?? 0;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const [subRes, statsRes] = await Promise.all([
        api.get(`/forms/submissions?${params}`),
        api.get('/forms/stats'),
      ]);

      setSubmissions(subRes.data.data.submissions || []);
      setTotal(subRes.data.data.pagination?.total || 0);
      setStats(statsRes.data.data);
    } catch {
      toast.error('Failed to load form submissions');
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, statusFilter, search, startDate, endDate]);

  useEffect(() => {
    const t = setTimeout(fetchAll, 400);
    return () => clearTimeout(t);
  }, [fetchAll]);

  const openDetail = async (sub: FormSubmission) => {
    setDetailLoading(true);
    setSelected(sub);
    try {
      const res = await api.get(`/forms/submissions/${sub._id}`);
      setSelected(res.data.data.submission);
      if (sub.status === 'new') {
        await api.patch(`/forms/submissions/${sub._id}/status`, { status: 'read' });
        setSubmissions((prev) =>
          prev.map((s) => (s._id === sub._id ? { ...s, status: 'read' } : s)),
        );
      }
    } catch {
      toast.error('Failed to load submission details');
    } finally {
      setDetailLoading(false);
    }
  };

  const deleteSubmission = async (id: string) => {
    if (!canDeleteSubmission) {
      toast.error('You do not have permission to delete submissions');
      return;
    }

    setDeletingId(id);
    try {
      await api.delete(`/forms/submissions/${id}`);
      if (selected?._id === id) setSelected(null);
      toast.success('Submission deleted');
      await fetchAll();
    } catch {
      toast.error('Failed to delete submission');
    } finally {
      setDeletingId(null);
    }
  };

  const requestDeleteSubmission = async (id: string) => {
    if (!canDeleteSubmission) {
      toast.error('You do not have permission to delete submissions');
      return;
    }

    const result = await showConfirm('Delete submission?', 'This will permanently remove the form submission and cannot be undone.');
    if (!result.isConfirmed) return;

    await deleteSubmission(id);
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/forms/submissions/${id}/status`, { status });
      setSubmissions((prev) => prev.map((s) => (s._id === id ? { ...s, status } : s)));
      if (selected?._id === id) setSelected((prev) => prev ? { ...prev, status } : null);
      toast.success(`Marked as ${status}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const newCount = getStatCount(stats.byStatus as { status: string; count: number }[], 'new');
  const respondedCount = getStatCount(stats.byStatus as { status: string; count: number }[], 'responded');
  const assessmentCount = getStatCount(stats.byType as { type: string; count: number }[], 'assessment');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="p-6 min-h-screen"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text-primary)' }}
    >
      {/* Header */}
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
              whileHover={{ rotate: [0, -8, 8, 0], scale: 1.08 }}
              transition={{ duration: 0.4 }}
            >
              <FileText size={22} style={{ color: 'var(--accent)' }} />
            </motion.div>
            Form Submissions
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Manage and respond to website form submissions
          </p>
        </div>
        <motion.button
          onClick={() => { setPage(1); fetchAll(); }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm cursor-pointer"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw size={14} /> Refresh
        </motion.button>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
      >
        {[
          { label: 'Total Submissions', value: stats.total, color: 'var(--accent)', bg: 'var(--accent-subtle)', Icon: FileText },
          { label: 'New (Unread)', value: newCount, color: 'var(--warning)', bg: 'var(--warning-subtle)', Icon: Mail },
          { label: 'Responded', value: respondedCount, color: 'var(--success)', bg: 'var(--success-subtle)', Icon: CheckCircle },
          { label: 'Assessment Requests', value: assessmentCount, color: 'var(--info)', bg: 'var(--info-subtle)', Icon: ClipboardList },
        ].map((s) => (
          <motion.div
            key={s.label}
            variants={fadeUp}
            whileHover={{ scale: 1.03, y: -3, transition: { type: 'spring' as const, stiffness: 400, damping: 18 } }}
            whileTap={{ scale: 0.98 }}
            className="border rounded-xl p-4 transition-shadow cursor-pointer"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <s.Icon size={14} style={{ color: s.color }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value.toLocaleString()}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="flex gap-3 mb-6 flex-wrap"
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, email, company…"
            className="w-full pl-10 pr-4 py-3 border rounded-xl text-sm placeholder-gray-500 focus:outline-none"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="px-4 py-3 border rounded-xl text-sm focus:outline-none"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">All Types</option>
          <option value="contact">Contact</option>
          <option value="assessment">Assessment</option>
          <option value="appointment">Appointment</option>
          <option value="download">Download</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-3 border rounded-xl text-sm focus:outline-none"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="read">Read</option>
          <option value="responded">Responded</option>
          <option value="archived">Archived</option>
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
          className="px-4 py-3 border rounded-xl text-sm focus:outline-none"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          placeholder="Start date"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
          className="px-4 py-3 border rounded-xl text-sm focus:outline-none"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          placeholder="End date"
        />
      </motion.div>

      {/* Table */}
      <div
        className="border rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-10 h-10 border-4 border-t-transparent rounded-full"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
            />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading submissions...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr
                  className="border-b text-xs uppercase tracking-wider"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  <th className="text-left px-6 py-4">Date</th>
                  <th className="text-left px-6 py-4">Name</th>
                  <th className="text-left px-6 py-4">Email</th>
                  <th className="text-left px-6 py-4">Type</th>
                  <th className="text-left px-6 py-4">Status</th>
                  <th className="text-left px-6 py-4">Page</th>
                  <th className="text-left px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {submissions.map((sub, idx) => {
                  const typeConf = TYPE_CONFIG[sub.type] || TYPE_CONFIG.contact;
                  const statusConf = STATUS_CONFIG[sub.status] || STATUS_CONFIG.new;
                  return (
                    <motion.tr
                      key={sub._id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: idx * 0.03 }}
                      whileHover={{ backgroundColor: 'var(--surface-muted)' }}
                      className="transition-colors cursor-pointer"
                      onClick={() => openDetail(sub)}
                      style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
                    >
                      <td className="px-6 py-4 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }} suppressHydrationWarning>
                        {new Date(sub.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        <br />
                        <span className="opacity-60">
                          {new Date(sub.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold">{sub.name}</p>
                        {sub.company && (
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub.company}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-muted)' }}>{sub.email}</td>
                      <td className="px-6 py-4">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold capitalize"
                          style={{ color: typeConf.color, backgroundColor: typeConf.bg }}
                        >
                          <typeConf.Icon size={12} />
                          {typeConf.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                          style={{ color: statusConf.color, backgroundColor: statusConf.bg }}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${sub.status === 'new' ? 'animate-pulse' : ''}`}
                            style={{ backgroundColor: statusConf.color }}
                          />
                          {statusConf.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs max-w-[120px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {sub.page || '—'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <motion.button
                            onClick={() => openDetail(sub)}
                            whileHover={{ scale: 1.15 }}
                            whileTap={{ scale: 0.9 }}
                            className="p-1.5 rounded-lg cursor-pointer"
                            style={{ color: 'var(--accent)' }}
                            title="View details"
                          >
                            <Eye size={14} />
                          </motion.button>
                          {sub.status !== 'responded' && (
                            <motion.button
                              onClick={() => updateStatus(sub._id, 'responded')}
                              whileHover={{ scale: 1.15 }}
                              whileTap={{ scale: 0.9 }}
                              className="p-1.5 rounded-lg cursor-pointer"
                              style={{ color: 'var(--success)' }}
                              title="Mark as responded"
                            >
                              <CheckCircle size={14} />
                            </motion.button>
                          )}
                          {sub.status !== 'archived' && (
                            <motion.button
                              onClick={() => updateStatus(sub._id, 'archived')}
                              whileHover={{ scale: 1.15 }}
                              whileTap={{ scale: 0.9 }}
                              className="p-1.5 rounded-lg cursor-pointer"
                              style={{ color: 'var(--text-muted)' }}
                              title="Archive"
                            >
                              <Archive size={14} />
                            </motion.button>
                          )}
                          {canDeleteSubmission && (
                            <motion.button
                              onClick={() => requestDeleteSubmission(sub._id)}
                              disabled={deletingId === sub._id}
                              whileHover={{ scale: deletingId === sub._id ? 1 : 1.15 }}
                              whileTap={{ scale: deletingId === sub._id ? 1 : 0.9 }}
                              className="p-1.5 rounded-lg cursor-pointer disabled:opacity-50"
                              style={{ color: 'var(--error, #ef4444)' }}
                              title="Delete submission"
                            >
                              <Trash2 size={14} />
                            </motion.button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
                {submissions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center" style={{ color: 'var(--text-muted)' }}>
                      <FileText size={32} className="mx-auto mb-2 opacity-20" />
                      No form submissions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between mt-4"
        >
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {submissions.length} of {total}
          </p>
          <div className="flex gap-2">
            <motion.button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              whileHover={{ scale: page === 1 ? 1 : 1.03 }}
              whileTap={{ scale: page === 1 ? 1 : 0.97 }}
              className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-40 cursor-pointer"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              Previous
            </motion.button>
            <motion.button
              onClick={() => setPage((p) => p + 1)}
              disabled={submissions.length < 20}
              whileHover={{ scale: submissions.length < 20 ? 1 : 1.03 }}
              whileTap={{ scale: submissions.length < 20 ? 1 : 0.97 }}
              className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-40 cursor-pointer"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              Next
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Detail Slide-Over Panel */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-40"
              onClick={() => setSelected(null)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring' as const, stiffness: 300, damping: 30 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-lg z-50 border-l overflow-y-auto"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
            >
              <div className="p-6">
                {/* Panel Header */}
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    {(() => {
                      const Ic = TYPE_CONFIG[selected.type]?.Icon || FileText;
                      return <Ic size={18} style={{ color: TYPE_CONFIG[selected.type]?.color || 'var(--accent)' }} />;
                    })()}
                    {TYPE_CONFIG[selected.type]?.label || selected.type} Submission
                  </h2>
                  <motion.button
                    onClick={() => setSelected(null)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="p-2 rounded-lg cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X size={18} />
                  </motion.button>
                </div>

                {detailLoading ? (
                  <div className="flex justify-center py-12">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-8 h-8 border-4 border-t-transparent rounded-full"
                      style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                    />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Status & Actions */}
                    <div
                      className="border rounded-xl p-4"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                          Status
                        </span>
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                          style={{
                            color: STATUS_CONFIG[selected.status]?.color,
                            backgroundColor: STATUS_CONFIG[selected.status]?.bg,
                          }}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${selected.status === 'new' ? 'animate-pulse' : ''}`}
                            style={{ backgroundColor: STATUS_CONFIG[selected.status]?.color }}
                          />
                          {STATUS_CONFIG[selected.status]?.label || selected.status}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {selected.status !== 'read' && selected.status !== 'new' && (
                          <button
                            onClick={() => updateStatus(selected._id, 'new')}
                            className="flex-1 px-3 py-2 border rounded-lg text-xs font-medium cursor-pointer"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                          >
                            Mark Unread
                          </button>
                        )}
                        {selected.status !== 'responded' && (
                          <button
                            onClick={() => updateStatus(selected._id, 'responded')}
                            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer text-white"
                            style={{ backgroundColor: 'var(--success)' }}
                          >
                            Mark Responded
                          </button>
                        )}
                        {selected.status !== 'archived' && (
                          <button
                            onClick={() => updateStatus(selected._id, 'archived')}
                            className="flex-1 px-3 py-2 border rounded-lg text-xs font-medium cursor-pointer"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                          >
                            Archive
                          </button>
                        )}
                        {canDeleteSubmission && (
                          <button
                            onClick={() => requestDeleteSubmission(selected._id)}
                            disabled={deletingId === selected._id}
                            className="px-3 py-2 border rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50"
                            style={{ borderColor: 'var(--error, #ef4444)', color: 'var(--error, #ef4444)' }}
                          >
                            {deletingId === selected._id ? 'Deleting…' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div
                      className="border rounded-xl p-4 space-y-3"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                    >
                      <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Contact Information
                      </h3>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <Mail size={14} style={{ color: 'var(--text-muted)' }} />
                          <div>
                            <p className="text-sm font-semibold">{selected.name}</p>
                            <a
                              href={`mailto:${selected.email}`}
                              className="text-xs hover:underline"
                              style={{ color: 'var(--accent)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {selected.email}
                            </a>
                          </div>
                        </div>
                        {selected.phone && (
                          <div className="flex items-center gap-3">
                            <Phone size={14} style={{ color: 'var(--text-muted)' }} />
                            <span className="text-sm">{selected.phone}</span>
                          </div>
                        )}
                        {selected.company && (
                          <div className="flex items-center gap-3">
                            <Building2 size={14} style={{ color: 'var(--text-muted)' }} />
                            <span className="text-sm">{selected.company}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Message */}
                    {selected.message && (
                      <div
                        className="border rounded-xl p-4"
                        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                      >
                        <h3 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                          Message
                        </h3>
                        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                          {selected.message}
                        </p>
                      </div>
                    )}

                    {/* Form Data (for assessment/appointment/download) */}
                    {selected.formData && Object.keys(selected.formData).length > 0 && (
                      <div
                        className="border rounded-xl p-4"
                        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                      >
                        <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                          Form Details
                        </h3>
                        <div className="space-y-2">
                          {Object.entries(selected.formData).map(([key, val]) => (
                            <div key={key} className="flex justify-between items-start gap-4">
                              <span className="text-xs capitalize shrink-0" style={{ color: 'var(--text-muted)' }}>
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </span>
                              <span className="text-xs text-right" style={{ color: 'var(--text-secondary)' }}>
                                {String(val ?? '—')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div
                      className="border rounded-xl p-4 space-y-2"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                    >
                      <h3 className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                        Metadata
                      </h3>
                      <div className="flex items-center gap-2">
                        <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }} suppressHydrationWarning>
                          Submitted {new Date(selected.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {selected.page && (
                        <div className="flex items-center gap-2">
                          <Globe size={12} style={{ color: 'var(--text-muted)' }} />
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Page: {selected.page}</span>
                        </div>
                      )}
                      {selected.respondedBy && (
                        <div className="flex items-center gap-2">
                          <CheckCircle size={12} style={{ color: 'var(--success)' }} />
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }} suppressHydrationWarning>
                            Responded by {selected.respondedBy.name}
                            {selected.respondedAt && ` on ${new Date(selected.respondedAt).toLocaleDateString()}`}
                          </span>
                        </div>
                      )}
                      {selected.leadId && (
                        <div className="flex items-center gap-2">
                          <ExternalLink size={12} style={{ color: 'var(--accent)' }} />
                          <span className="text-xs" style={{ color: 'var(--accent)' }}>
                            Linked lead: {selected.leadId.name} ({selected.leadId.status})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
