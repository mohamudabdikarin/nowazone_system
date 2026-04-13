'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Receipt,
  Plus,
  Search,
  ArrowLeft,
  Pencil,
  Trash2,
  X,
  RefreshCw,
} from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'react-toastify';
import { showConfirm } from '@/lib/sweetalert';

type ExpenseCategory = 'office' | 'software' | 'travel' | 'marketing' | 'utilities' | 'payroll' | 'supplies' | 'other';
type ExpenseStatus = 'pending' | 'approved' | 'reimbursed' | 'rejected';

interface Expense {
  _id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  vendor?: string;
  date: string;
  status: ExpenseStatus;
  receiptUrl?: string;
  notes?: string;
  createdAt: string;
}

interface Stats {
  total: number;
  byStatus: Record<string, { count: number; amount: number }>;
  byCategory: Record<string, { count: number; amount: number }>;
  monthlyTotal: number;
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  office: 'Office',
  software: 'Software',
  travel: 'Travel',
  marketing: 'Marketing',
  utilities: 'Utilities',
  payroll: 'Payroll',
  supplies: 'Supplies',
  other: 'Other',
};

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  reimbursed: 'Reimbursed',
  rejected: 'Rejected',
};

const STATUS_COLORS: Record<ExpenseStatus, string> = {
  pending: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  approved: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  reimbursed: 'text-green-400 bg-green-400/10 border-green-400/20',
  rejected: 'text-red-400 bg-red-400/10 border-red-400/20',
};

const EMPTY_FORM = {
  description: '',
  amount: 0,
  category: 'other' as ExpenseCategory,
  vendor: '',
  notes: '',
  status: 'pending' as ExpenseStatus,
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (search) params.set('search', search);
      const [expRes, statsRes] = await Promise.all([
        api.get(`/expenses?${params}`),
        api.get('/expenses/stats'),
      ]);
      setExpenses(expRes.data.data.expenses || []);
      setStats(statsRes.data.data);
    } catch {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, search]);

  useEffect(() => {
    const t = setTimeout(fetchAll, 400);
    return () => clearTimeout(t);
  }, [fetchAll]);

  const resetForm = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (exp: Expense) => {
    setEditingId(exp._id);
    setForm({
      description: exp.description,
      amount: exp.amount,
      category: exp.category,
      vendor: exp.vendor || '',
      notes: exp.notes || '',
      status: exp.status,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/expenses/${editingId}`, form);
        toast.success('Expense updated');
      } else {
        await api.post('/expenses', form);
        toast.success('Expense added');
      }
      resetForm();
      fetchAll();
    } catch {
      toast.error('Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = async (id: string) => {
    const result = await showConfirm('Delete expense?', 'Delete this expense?');
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Expense deleted');
      setSelected(null);
      fetchAll();
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (loading && expenses.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" style={{ color: 'var(--text-muted)' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-4 border-t-transparent rounded-full"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
        />
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/finance"
            className="p-2 rounded-lg border hover:bg-[var(--surface-muted)] transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <motion.div
                className="p-2 rounded-xl"
                style={{ backgroundColor: 'var(--error-subtle)' }}
                whileHover={{ scale: 1.05 }}
              >
                <Receipt size={22} style={{ color: 'var(--error)' }} />
              </motion.div>
              Expenses
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Track and manage business expenses
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={() => fetchAll()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2.5 rounded-lg border"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <RefreshCw size={14} />
          </motion.button>
          <motion.button
            onClick={openCreate}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Plus size={16} /> Add Expense
          </motion.button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'This Month', value: formatCurrency(stats.monthlyTotal), color: 'var(--error)' },
            { label: 'Total Count', value: stats.total, color: 'var(--accent)' },
            {
              label: 'Pending',
              value: stats.byStatus?.pending ? `${stats.byStatus.pending.count} • ${formatCurrency(stats.byStatus.pending.amount)}` : '0',
              color: 'var(--warning)',
            },
            {
              label: 'Approved',
              value: stats.byStatus?.approved ? `${stats.byStatus.approved.count} • ${formatCurrency(stats.byStatus.approved.amount)}` : '0',
              color: 'var(--success)',
            },
          ].map((s) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="border rounded-xl p-4"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by description or vendor…"
            className="w-full pl-10 pr-4 py-3 border rounded-xl text-sm focus:outline-none"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-3 border rounded-xl text-sm focus:outline-none"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">All Categories</option>
          {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-3 border rounded-xl text-sm focus:outline-none"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">All Statuses</option>
          {(Object.keys(STATUS_LABELS) as ExpenseStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div
        className="border rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <table className="w-full">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <th className="text-left px-6 py-4">Date</th>
              <th className="text-left px-6 py-4">Description</th>
              <th className="text-left px-6 py-4">Category</th>
              <th className="text-left px-6 py-4">Amount</th>
              <th className="text-left px-6 py-4">Status</th>
              <th className="text-left px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {expenses.map((exp, idx) => (
              <motion.tr
                key={exp._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
                whileHover={{ backgroundColor: 'var(--surface-muted)' }}
                className="transition-colors cursor-pointer"
                onClick={() => setSelected(exp)}
              >
                <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {new Date(exp.date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm font-semibold">{exp.description}</p>
                  {exp.vendor && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{exp.vendor}</p>}
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>
                    {CATEGORY_LABELS[exp.category]}
                  </span>
                </td>
                <td className="px-6 py-4 font-bold" style={{ color: 'var(--error)' }}>{formatCurrency(exp.amount)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${STATUS_COLORS[exp.status]}`}>
                    {STATUS_LABELS[exp.status]}
                  </span>
                </td>
                <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <motion.button
                      onClick={() => openEdit(exp)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-1.5 rounded-lg cursor-pointer"
                      style={{ color: 'var(--accent)' }}
                    >
                      <Pencil size={14} />
                    </motion.button>
                    <motion.button
                      onClick={() => deleteExpense(exp._id)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-1.5 rounded-lg cursor-pointer"
                      style={{ color: 'var(--error)' }}
                    >
                      <Trash2 size={14} />
                    </motion.button>
                  </div>
                </td>
              </motion.tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center" style={{ color: 'var(--text-muted)' }}>
                  <Receipt size={32} className="mx-auto mb-2 opacity-20" />
                  No expenses found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && resetForm()}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl p-6 border"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold mb-4">{editingId ? 'Edit Expense' : 'Add Expense'}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Description *</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    required
                    className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="e.g. Office supplies"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Amount *</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.amount || ''}
                    onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                    required
                    className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
                    className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Vendor</label>
                  <input
                    value={form.vendor}
                    onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                    className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="Optional"
                  />
                </div>
                {editingId && (
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ExpenseStatus }))}
                      className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      {(Object.keys(STATUS_LABELS) as ExpenseStatus[]).map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none resize-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="Optional"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 py-2.5 rounded-xl font-medium text-sm border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer disabled:opacity-60"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {saving ? 'Saving…' : editingId ? 'Update' : 'Add'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-end z-50"
            onClick={(e) => e.target === e.currentTarget && setSelected(null)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="w-full max-w-md h-full overflow-y-auto p-6 border-l"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold">Expense Details</h2>
                <motion.button
                  onClick={() => setSelected(null)}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  className="cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={20} />
                </motion.button>
              </div>
              <div className="space-y-4">
                <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg)' }}>
                  <p className="text-xs uppercase mb-2 tracking-wide" style={{ color: 'var(--text-muted)' }}>Description</p>
                  <p className="font-semibold">{selected.description}</p>
                </div>
                <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg)' }}>
                  <p className="text-xs uppercase mb-2 tracking-wide" style={{ color: 'var(--text-muted)' }}>Amount</p>
                  <p className="text-xl font-bold" style={{ color: 'var(--error)' }}>{formatCurrency(selected.amount)}</p>
                </div>
                <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg)' }}>
                  <p className="text-xs uppercase mb-2 tracking-wide" style={{ color: 'var(--text-muted)' }}>Category</p>
                  <span className="text-sm font-medium">{CATEGORY_LABELS[selected.category]}</span>
                </div>
                {selected.vendor && (
                  <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg)' }}>
                    <p className="text-xs uppercase mb-2 tracking-wide" style={{ color: 'var(--text-muted)' }}>Vendor</p>
                    <p className="text-sm">{selected.vendor}</p>
                  </div>
                )}
                <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg)' }}>
                  <p className="text-xs uppercase mb-2 tracking-wide" style={{ color: 'var(--text-muted)' }}>Status</p>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${STATUS_COLORS[selected.status]}`}>
                    {STATUS_LABELS[selected.status]}
                  </span>
                </div>
                <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg)' }}>
                  <p className="text-xs uppercase mb-2 tracking-wide" style={{ color: 'var(--text-muted)' }}>Date</p>
                  <p className="text-sm">{new Date(selected.date).toLocaleDateString()}</p>
                </div>
                {selected.notes && (
                  <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg)' }}>
                    <p className="text-xs uppercase mb-2 tracking-wide" style={{ color: 'var(--text-muted)' }}>Notes</p>
                    <p className="text-sm">{selected.notes}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => { openEdit(selected); setShowModal(true); setSelected(null); }}
                    className="flex-1 py-2.5 rounded-xl font-medium text-sm border flex items-center justify-center gap-2"
                    style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    onClick={() => deleteExpense(selected._id)}
                    className="flex-1 py-2.5 rounded-xl font-medium text-sm border flex items-center justify-center gap-2"
                    style={{ borderColor: 'var(--border)', color: 'var(--error)' }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
