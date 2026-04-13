'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, Plus, Search, FileText, CheckCircle, Clock, XCircle, X, Trash2, DownloadCloud, Pencil } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { showConfirm } from '@/lib/sweetalert';

interface InvoiceItem { description: string; quantity: number; unitPrice: number; taxRate: number; }
interface Invoice {
  _id: string; invoiceNumber: string; clientName: string; clientEmail: string;
  clientAddress?: string;
  items: InvoiceItem[]; total: number; subtotal: number; taxTotal: number;
  status: string; dueDate?: string; paidAt?: string; createdAt: string; notes?: string;
  isRecurring?: boolean;
  recurrenceInterval?: 'weekly' | 'monthly' | 'yearly' | null;
  recurrenceCount?: number | null;
  recurrenceRemaining?: number | null;
  firstIssueDate?: string;
  nextIssueDate?: string;
  parentInvoiceId?: string | null;
}
interface Stats { total: number; paid: { count: number; amount: number }; pending: { count: number; amount: number }; overdue: number; monthlyRevenue: number; }

const STATUS_COLORS: Record<string, string> = {
  draft:     'text-gray-400 bg-gray-400/10 border-gray-400/20',
  sent:      'text-blue-400 bg-blue-400/10 border-blue-400/20',
  paid:      'text-green-400 bg-green-400/10 border-green-400/20',
  overdue:   'text-red-400 bg-red-400/10 border-red-400/20',
  cancelled: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
};

const EMPTY_FORM = {
  clientName: '',
  clientEmail: '',
  clientAddress: '',
  dueDate: '',
  notes: '',
  isRecurring: false,
  recurrenceInterval: '' as '' | 'weekly' | 'monthly' | 'yearly',
  recurrenceCount: '',
  firstIssueDate: '',
};
const EMPTY_ITEM = { description: '', quantity: 1, unitPrice: 0, taxRate: 0 };
const formatDateForInput = (value?: string) => (value ? new Date(value).toISOString().slice(0, 10) : '');
type BasicFormKey = 'clientName' | 'clientEmail';

const CLIENT_FORM_FIELDS: { label: string; key: BasicFormKey; placeholder: string; type?: string }[] = [
  { label: 'Client Name', key: 'clientName', placeholder: 'Acme Corp' },
  { label: 'Client Email', key: 'clientEmail', placeholder: 'billing@acme.com', type: 'email' },
];

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.03, delayChildren: 0.04 } } };
const fadeUp = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 280, damping: 24 } },
};

const STATS_CONFIG: Record<string, { accent: string; bg: string }> = {
  green:  { accent: 'var(--success)', bg: 'var(--success-subtle)' },
  cyan:   { accent: 'var(--accent)', bg: 'var(--accent-subtle)' },
  yellow: { accent: 'var(--warning)', bg: 'var(--warning-subtle)' },
  red:   { accent: 'var(--error)', bg: 'var(--error-subtle)' },
};

export default function InvoicesPage() {
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get('status') || '';
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState(statusFromUrl);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [items, setItems]         = useState<InvoiceItem[]>([{ ...EMPTY_ITEM }]);
  const [saving, setSaving]       = useState(false);
  const [selected, setSelected]   = useState<Invoice | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      if (search)       params.set('search', search);
      const [invRes, statsRes] = await Promise.all([
        api.get(`/invoices?${params}`),
        api.get('/invoices/stats'),
      ]);
      setInvoices(invRes.data.data.invoices || []);
      setStats(statsRes.data.data);
    } catch { toast.error('Failed to load invoices'); }
    finally { setLoading(false); }
  }, [statusFilter, search]);

  useEffect(() => {
    setStatus(statusFromUrl);
  }, [statusFromUrl]);

  useEffect(() => {
    const t = setTimeout(fetchAll, 400);
    return () => clearTimeout(t);
  }, [fetchAll]);

  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, key: keyof InvoiceItem, val: string | number) =>
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [key]: val } : item));

  const calcTotal = () => items.reduce((s, i) => {
    const sub = i.quantity * i.unitPrice;
    return s + sub + (sub * (i.taxRate || 0)) / 100;
  }, 0);

  const resetEditorState = () => {
    setShowModal(false);
    setEditingInvoiceId(null);
    setForm(EMPTY_FORM);
    setItems([{ ...EMPTY_ITEM }]);
  };

  const openCreateModal = () => {
    setEditingInvoiceId(null);
    setForm(EMPTY_FORM);
    setItems([{ ...EMPTY_ITEM }]);
    setShowModal(true);
  };

  const openEditModal = (invoice: Invoice) => {
    setEditingInvoiceId(invoice._id);
    setForm({
      clientName: invoice.clientName || '',
      clientEmail: invoice.clientEmail || '',
      clientAddress: invoice.clientAddress || '',
      dueDate: formatDateForInput(invoice.dueDate),
      notes: invoice.notes || '',
      isRecurring: Boolean(invoice.isRecurring),
      recurrenceInterval: (invoice.recurrenceInterval || '') as '' | 'weekly' | 'monthly' | 'yearly',
      recurrenceCount: invoice.recurrenceCount ? String(invoice.recurrenceCount) : '',
      firstIssueDate: formatDateForInput(invoice.firstIssueDate),
    });
    setItems(
      invoice.items?.length
        ? invoice.items.map((item) => ({
            description: item.description || '',
            quantity: Number.isFinite(item.quantity) ? item.quantity : 1,
            unitPrice: Number.isFinite(item.unitPrice) ? item.unitPrice : 0,
            taxRate: Number.isFinite(item.taxRate) ? item.taxRate : 0,
          }))
        : [{ ...EMPTY_ITEM }]
    );
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setSaving(true);
    try {
      const cleanedItems = items
        .map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          taxRate: Number(item.taxRate) || 0,
        }))
        .filter((item) => item.description.length > 0);

      if (cleanedItems.length === 0) {
        toast.error('Add at least one valid line item');
        setSaving(false);
        return;
      }

      const payload: Record<string, unknown> = {
        clientName: form.clientName,
        clientEmail: form.clientEmail,
        clientAddress: form.clientAddress || undefined,
        dueDate: form.dueDate || undefined,
        notes: form.notes || undefined,
        items: cleanedItems,
      };

      if (form.isRecurring) {
        payload.isRecurring = true;
        payload.recurrenceInterval = form.recurrenceInterval || undefined;
        payload.recurrenceCount = form.recurrenceCount ? Number(form.recurrenceCount) : undefined;
        payload.firstIssueDate = form.firstIssueDate || form.dueDate || undefined;
      }

      if (editingInvoiceId) {
        await api.patch(`/invoices/${editingInvoiceId}`, payload);
        toast.success('Invoice updated!');
      } else {
        await api.post('/invoices', payload);
        toast.success('Invoice created!');
      }
      resetEditorState();
      fetchAll();
    } catch (err: unknown) {
      const message =
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed';
      toast.error(message);
    }
    finally { setSaving(false); }
  };

  const markPaid = async (id: string) => {
    try {
      await api.patch(`/invoices/${id}/mark-paid`);
      toast.success('Invoice marked as paid');
      fetchAll();
    } catch { toast.error('Failed'); }
  };

  const deleteInvoice = async (id: string) => {
    const result = await showConfirm('Delete invoice?', 'Delete this invoice?');
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/invoices/${id}`);
      setInvoices(prev => prev.filter(i => i._id !== id));
      toast.success('Deleted');
    } catch { toast.error('Failed'); }
  };

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const downloadPdf = async (id: string, invoiceNumber?: string) => {
    try {
      const response = await api.get(`/invoices/${id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoiceNumber || 'invoice'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 border-4 border-t-transparent rounded-full"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      className="p-6 min-h-screen" style={{ backgroundColor: 'var(--bg)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring' as const, stiffness: 260, damping: 24 }}
        className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <motion.div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--success-subtle)' }}
              whileHover={{ rotate: [0, -8, 8, 0], scale: 1.08 }} transition={{ duration: 0.4 }}>
              <DollarSign size={22} style={{ color: 'var(--success)' }} />
            </motion.div>
            Invoices & Finance
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Track revenue, payments, and outstanding invoices</p>
        </div>
        <motion.button onClick={openCreateModal}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer"
          style={{ backgroundColor: 'var(--accent)' }}>
          <Plus size={16} /> New Invoice
        </motion.button>
      </motion.div>

      {/* Stats */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {stats && [
          { label: 'Monthly Revenue', value: fmt(stats.monthlyRevenue), color: 'green', Icon: DollarSign },
          { label: 'Total Invoices', value: stats.total, color: 'cyan', Icon: FileText },
          { label: 'Paid', value: `${stats.paid.count} • ${fmt(stats.paid.amount)}`, color: 'green', Icon: CheckCircle },
          { label: 'Pending', value: `${stats.pending.count} • ${fmt(stats.pending.amount)}`, color: 'yellow', Icon: Clock },
          { label: 'Overdue', value: stats.overdue, color: 'red', Icon: XCircle },
        ].map(s => {
          const cfg = STATS_CONFIG[s.color];
          return (
            <motion.div key={s.label} variants={fadeUp}
              whileHover={{ scale: 1.03, y: -3, transition: { type: 'spring' as const, stiffness: 400, damping: 18 } }}
              whileTap={{ scale: 0.98 }}
              className="border rounded-xl p-4 transition-shadow cursor-pointer"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <s.Icon size={14} style={{ color: cfg?.accent }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
              </div>
              <p className="text-lg font-bold truncate" style={{ color: cfg?.accent }}>{s.value}</p>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices…"
            className="w-full pl-10 pr-4 py-3 border rounded-xl text-sm placeholder-gray-500 focus:outline-none"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          className="px-4 py-3 border rounded-xl text-sm focus:outline-none"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Statuses</option>
          {['draft','sent','paid','overdue','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="border rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
        <table className="w-full">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <th className="text-left px-6 py-4">Invoice #</th>
              <th className="text-left px-6 py-4">Client</th>
              <th className="text-left px-6 py-4">Amount</th>
              <th className="text-left px-6 py-4">Status</th>
              <th className="text-left px-6 py-4">Due Date</th>
              <th className="text-left px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {invoices.map(inv => (
              <motion.tr key={inv._id} whileHover={{ backgroundColor: 'var(--surface-muted)' }} className="transition-colors cursor-pointer">
                <td className="px-6 py-4">
                  <button onClick={() => setSelected(inv)} className="text-sm font-mono hover:underline cursor-pointer" style={{ color: 'var(--accent)' }}>{inv.invoiceNumber}</button>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm font-semibold">{inv.clientName}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{inv.clientEmail}</p>
                </td>
                <td className="px-6 py-4 text-sm font-bold" style={{ color: 'var(--success)' }}>{fmt(inv.total)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${STATUS_COLORS[inv.status]}`}>{inv.status}</span>
                </td>
                <td className="px-6 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <motion.button
                      onClick={() => downloadPdf(inv._id, inv.invoiceNumber)}
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      className="text-xs px-2.5 py-1 rounded-lg cursor-pointer flex items-center gap-1"
                      style={{ backgroundColor: 'var(--surface)', color: 'var(--text-secondary)', borderColor: 'var(--border)', borderWidth: 1, borderStyle: 'solid' }}
                    >
                      <DownloadCloud size={12} />
                      PDF
                    </motion.button>
                    {inv.status !== 'paid' && (
                      <motion.button onClick={() => markPaid(inv._id)}
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      className="text-xs px-2.5 py-1 rounded-lg cursor-pointer"
                      style={{ backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}>
                        Mark Paid
                      </motion.button>
                    )}
                    <motion.button
                      onClick={() => openEditModal(inv)}
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      className="text-xs px-2.5 py-1 rounded-lg cursor-pointer flex items-center gap-1"
                      style={{ backgroundColor: 'var(--surface)', color: 'var(--accent)', borderColor: 'var(--border)', borderWidth: 1, borderStyle: 'solid' }}
                    >
                      <Pencil size={12} />
                      Edit
                    </motion.button>
                    <motion.button onClick={() => deleteInvoice(inv._id)}
                      whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                      className="cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                      <Trash2 size={14} />
                    </motion.button>
                  </div>
                </td>
              </motion.tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-16 text-center" style={{ color: 'var(--text-muted)' }}>
                <FileText size={32} className="mx-auto mb-2 opacity-20" />
                No invoices found
              </td></tr>
            )}
          </tbody>
        </table>
      </motion.div>

      {/* Invoice Detail Drawer */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-end z-50"
            onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              className="w-full max-w-lg h-full overflow-y-auto p-6 border-l"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
              onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold font-mono">{selected.invoiceNumber}</h2>
                <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold border ${STATUS_COLORS[selected.status]}`}>{selected.status}</span>
              </div>
              <motion.button onClick={() => setSelected(null)}
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
                className="cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <X size={20} />
              </motion.button>
            </div>
            <div className="space-y-4">
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg)' }}>
                <p className="text-xs uppercase mb-2 tracking-wide" style={{ color: 'var(--text-muted)' }}>Client</p>
                <p className="font-semibold">{selected.clientName}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{selected.clientEmail}</p>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg)' }}>
                <p className="text-xs uppercase mb-3 tracking-wide" style={{ color: 'var(--text-muted)' }}>Line Items</p>
                <div className="space-y-2">
                  {selected.items.map((item, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                      <div>
                        <p className="text-sm font-medium">{item.description}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.quantity} × ${item.unitPrice} {item.taxRate > 0 && `(${item.taxRate}% tax)`}</p>
                      </div>
                      <p className="font-semibold" style={{ color: 'var(--success)' }}>{fmt(item.quantity * item.unitPrice)}</p>
                    </div>
                  ))}
                </div>
                <div className="pt-3 mt-3 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex justify-between text-sm" style={{ color: 'var(--text-muted)' }}><span>Subtotal</span><span>{fmt(selected.subtotal)}</span></div>
                  <div className="flex justify-between text-sm" style={{ color: 'var(--text-muted)' }}><span>Tax</span><span>{fmt(selected.taxTotal)}</span></div>
                  <div className="flex justify-between font-bold" style={{ color: 'var(--success)' }}><span>Total</span><span>{fmt(selected.total)}</span></div>
                </div>
              </div>
              {selected.isRecurring && (
                <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg)' }}>
                  <p className="text-xs uppercase mb-2 tracking-wide" style={{ color: 'var(--text-muted)' }}>Recurring</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {selected.recurrenceInterval ? selected.recurrenceInterval.charAt(0).toUpperCase() + selected.recurrenceInterval.slice(1) : 'Recurring'} invoice
                    {typeof selected.recurrenceRemaining === 'number'
                      ? ` • ${selected.recurrenceRemaining} remaining`
                      : ''}
                  </p>
                  {selected.nextIssueDate && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Next issue on {new Date(selected.nextIssueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
              {selected.notes && (
                <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg)' }}>
                  <p className="text-xs uppercase mb-2 tracking-wide" style={{ color: 'var(--text-muted)' }}>Notes</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selected.notes}</p>
                </div>
              )}
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && resetEditorState()}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
              onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
              <DollarSign size={20} style={{ color: 'var(--success)' }} />
              {editingInvoiceId ? 'Edit Invoice' : 'Create Invoice'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {CLIENT_FORM_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
                    <input type={f.type || 'text'} value={form[f.key]} placeholder={f.placeholder} required
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Due Date</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Client Address</label>
                  <input value={form.clientAddress} onChange={e => setForm(p => ({ ...p, clientAddress: e.target.value }))} placeholder="Optional"
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 items-end">
                <label className="flex items-center gap-2 text-xs col-span-1">
                  <input
                    type="checkbox"
                    checked={form.isRecurring}
                    onChange={e =>
                      setForm(p => ({
                        ...p,
                        isRecurring: e.target.checked,
                        recurrenceInterval: e.target.checked ? p.recurrenceInterval : '',
                        recurrenceCount: e.target.checked ? p.recurrenceCount : '',
                        firstIssueDate: e.target.checked ? p.firstIssueDate : '',
                      }))
                    }
                  />
                  <span style={{ color: 'var(--text-secondary)' }}>Make recurring</span>
                </label>
                {form.isRecurring && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Interval</label>
                      <select
                        value={form.recurrenceInterval}
                        onChange={e => setForm(p => ({ ...p, recurrenceInterval: e.target.value as typeof p.recurrenceInterval }))}
                        className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none"
                        style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      >
                        <option value="">Select</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Occurrences (optional)</label>
                      <input
                        type="number"
                        min={1}
                        value={form.recurrenceCount}
                        onChange={e => setForm(p => ({ ...p, recurrenceCount: e.target.value }))}
                        className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none"
                        style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Line Items</label>
                  <motion.button type="button" onClick={addItem}
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    className="text-xs flex items-center gap-1 cursor-pointer" style={{ color: 'var(--accent)' }}>
                    <Plus size={12} /> Add Item
                  </motion.button>
                </div>
                
                <div
                  className="grid grid-cols-12 gap-2 px-1 mb-1 text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span className="col-span-4">Description</span>
                  <span className="col-span-2">Qty</span>
                  <span className="col-span-2">Unit Price</span>
                  <span className="col-span-2">Tax %</span>
                  <span className="col-span-1 text-right">Total</span>
                  <span className="col-span-1 text-center">Remove</span>
                </div>
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)}
                        placeholder="Website development, hosting, etc." required className="col-span-4 px-3 py-2 border rounded-xl text-xs focus:outline-none"
                        style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                      <input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', Number(e.target.value) || 1)}
                        placeholder="1" min="1" required className="col-span-2 px-3 py-2 border rounded-xl text-xs focus:outline-none"
                        style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                      <input type="number" value={item.unitPrice} onChange={e => updateItem(i, 'unitPrice', Number(e.target.value) || 0)}
                        placeholder="0.00" step="0.01" min="0" required className="col-span-2 px-3 py-2 border rounded-xl text-xs focus:outline-none"
                        style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                      <input type="number" value={item.taxRate} onChange={e => updateItem(i, 'taxRate', Number(e.target.value) || 0)}
                        placeholder="0" step="0.1" min="0" className="col-span-2 px-3 py-2 border rounded-xl text-xs focus:outline-none"
                        style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                      <div className="col-span-1 text-right text-xs font-semibold" style={{ color: 'var(--success)' }}>
                        {fmt((item.quantity * item.unitPrice) + ((item.quantity * item.unitPrice) * item.taxRate) / 100)}
                      </div>
                      <motion.button type="button" onClick={() => removeItem(i)}
                        disabled={items.length === 1}
                        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        className="col-span-1 flex justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" style={{ color: 'var(--text-muted)' }}>
                        <X size={14} />
                      </motion.button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-2">
                  <span className="text-sm font-bold" style={{ color: 'var(--success)' }}>Total: {fmt(calcTotal())}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                  placeholder="Payment terms, bank details, etc."
                  className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none resize-none"
                  style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>

              <div className="flex gap-3 pt-2">
                <motion.button type="button" onClick={resetEditorState}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="flex-1 py-2.5 border rounded-xl text-sm cursor-pointer"
                  style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  Cancel
                </motion.button>
                <motion.button type="submit" disabled={saving}
                  whileHover={{ scale: saving ? 1 : 1.02 }} whileTap={{ scale: saving ? 1 : 0.98 }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 text-white"
                  style={{ backgroundColor: 'var(--accent)' }}>
                  {saving ? (editingInvoiceId ? 'Updating…' : 'Creating…') : (editingInvoiceId ? 'Update Invoice' : 'Create Invoice')}
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
