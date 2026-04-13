'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CircleDollarSign, Filter, Plus, RefreshCw, Search,
  Target, Users2, TrendingUp, Trash2,
  Mail, Phone, Building2, Zap, CalendarClock, User, X,
} from 'lucide-react';
import api from '@/lib/api';
import { showError, showSuccess, showConfirm } from '@/lib/sweetalert';

const addLeadSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  phone: z.string().min(1, 'Phone is required').regex(/^[\d\s\-\+\(\)]+$/, 'Invalid phone'),
  company: z.string().optional(),
  source: z.enum(['website', 'referral', 'social', 'email', 'other']).optional(),
});
type AddLeadForm = z.infer<typeof addLeadSchema>;

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'converted' | 'lost';

interface Lead {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: LeadStatus;
  score?: number;
  source?: string;
  assignedTo?: { _id: string; name?: string; email?: string };
  followUpAt?: string | null;
  followUpNote?: string;
}

const STATUS_CONFIG: Record<LeadStatus, { label: string; dot: string; bg: string; text: string; border: string }> = {
  new:        { label: 'New',        dot: 'var(--accent)',  bg: 'var(--accent-subtle)',   text: 'var(--accent-text)', border: 'var(--accent-border)' },
  contacted:  { label: 'Contacted',  dot: 'var(--warning)', bg: 'var(--warning-subtle)', text: 'var(--warning)', border: 'var(--border)' },
  qualified:  { label: 'Qualified',  dot: 'var(--accent)',  bg: 'var(--accent-subtle)',   text: 'var(--accent-text)', border: 'var(--accent-border)' },
  proposal:   { label: 'Proposal',   dot: 'var(--warning)', bg: 'var(--warning-subtle)', text: 'var(--warning)', border: 'var(--border)' },
  negotiation:{ label: 'Negotiation', dot: 'var(--warning)', bg: 'var(--warning-subtle)', text: 'var(--warning)', border: 'var(--border)' },
  converted:  { label: 'Converted',  dot: 'var(--success)', bg: 'var(--success-subtle)',  text: 'var(--success)', border: 'var(--border)' },
  lost:       { label: 'Lost',       dot: 'var(--error)',   bg: 'var(--error-subtle)',   text: 'var(--error)',   border: 'var(--border)' },
};

const scoreColor = (s: number) =>
  s >= 75 ? 'var(--success)' : s >= 45 ? 'var(--warning)' : 'var(--error)';

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

export default function LeadsPage() {
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all');
  const [followUpDue, setFollowUpDue]   = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: leadsData, isLoading: loading } = useQuery({
    queryKey: ['leads', statusFilter, followUpDue],
    queryFn: async () => {
      const params: Record<string, string | number> = { page: 1, limit: 100 };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (followUpDue) params.followUpDue = 'true';
      const { data } = await api.get<{ data: { leads: Lead[] } }>('/leads', { params });
      return data.data;
    },
  });
  const leads = leadsData?.leads ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: AddLeadForm) => api.post('/leads', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setAddModalOpen(false);
      showSuccess('Lead created successfully');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showError(err.response?.data?.message || 'Failed to create lead');
    },
  });

  const updateLeadMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Lead> }) => api.patch(`/leads/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      showSuccess('Lead updated successfully');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showError(err.response?.data?.message || 'Failed to update lead');
    },
  });

  const deleteLeadMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/leads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      showSuccess('Lead deleted successfully');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showError(err.response?.data?.message || 'Failed to delete lead');
    },
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<AddLeadForm>({
    resolver: zodResolver(addLeadSchema),
    defaultValues: { name: '', email: '', phone: '', company: '', source: 'website' },
  });

  const onSubmitAdd = (data: AddLeadForm) => {
    createMutation.mutate(data);
  };
  const openAddModal = () => {
    reset();
    setAddModalOpen(true);
  };

  const updateLeadStatus = (id: string, status: LeadStatus) => {
    updateLeadMutation.mutate({ id, payload: { status } });
  };

  const deleteLead = async (id: string, name?: string) => {
    const result = await showConfirm('Delete lead?', `This will permanently delete ${name || 'this lead'}.`);
    if (!result.isConfirmed) return;
    deleteLeadMutation.mutate(id);
  };

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const status = (lead.status || 'new') as LeadStatus;
      const matchStatus = statusFilter === 'all' || status === statusFilter;
      const matchSearch = !q
        || (lead.name    || '').toLowerCase().includes(q)
        || (lead.email   || '').toLowerCase().includes(q)
        || (lead.company || '').toLowerCase().includes(q)
        || (lead.phone   || '').toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [leads, search, statusFilter]);

  const stats = useMemo(() => {
    const converted = leads.filter((l) => l.status === 'converted').length;
    const qualified = leads.filter((l) => l.status === 'qualified').length;
    const avgScore  = leads.length > 0
      ? Math.round(leads.reduce((s, l) => s + Number(l.score || 0), 0) / leads.length)
      : 0;
    return { total: leads.length, qualified, converted, avgScore };
  }, [leads]);

  const kpis = [
    { label: 'Total Leads',  value: stats.total,      icon: Users2,           accent: 'var(--accent)',  bg: 'var(--accent-subtle)' },
    { label: 'Qualified',    value: stats.qualified,  icon: Target,           accent: 'var(--accent)',  bg: 'var(--accent-subtle)' },
    { label: 'Converted',    value: stats.converted, icon: CircleDollarSign, accent: 'var(--success)', bg: 'var(--success-subtle)' },
    { label: 'Avg Score',    value: stats.avgScore,   icon: TrendingUp,       accent: 'var(--warning)', bg: 'var(--warning-subtle)' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen p-6 space-y-6"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text-primary)' }}
    >
      {/* ── Page Header ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring' as const, stiffness: 260, damping: 24 }}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-subtle)' }}
            whileHover={{ rotate: [0, -8, 8, 0], scale: 1.08 }}
            transition={{ duration: 0.4 }}
          >
            <Users2 size={20} style={{ color: 'var(--accent)' }} />
          </motion.div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>CRM Leads</h1>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Track and manage your sales pipeline
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['leads'] })}
            type="button"
            title="Refresh"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2.5 rounded-lg border transition-colors cursor-pointer"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <RefreshCw size={14} />
          </motion.button>
          <motion.button
            onClick={openAddModal}
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white cursor-pointer"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Plus size={15} /> Add Lead
          </motion.button>
        </div>
      </motion.div>

      {/* ── KPI Cards ───────────────────────────────────────── */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {kpis.map((k) => (
          <motion.div
            key={k.label}
            variants={fadeUp}
            whileHover={{ scale: 1.03, y: -3, transition: { type: 'spring' as const, stiffness: 400, damping: 18 } }}
            whileTap={{ scale: 0.98 }}
            className="rounded-xl border p-4 transition-shadow cursor-pointer"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: k.bg }}>
                <k.icon size={16} style={{ color: k.accent }} />
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                All time
              </span>
            </div>
            <p className="text-2xl font-bold mb-1" style={{ color: k.accent }}>{k.value}</p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{k.label}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Filters ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="flex flex-wrap gap-3"
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, company..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border text-[13px] focus:outline-none transition-colors"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
            onBlur={(e)  => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Status filter */}
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-muted)' }} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | LeadStatus)}
            className="pl-9 pr-8 py-2.5 rounded-lg border text-[13px] appearance-none cursor-pointer focus:outline-none"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="all">All Statuses</option>
            {(Object.keys(STATUS_CONFIG) as LeadStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </div>

        {/* Follow-up due toggle */}
        <motion.button
          type="button"
          onClick={() => setFollowUpDue((v) => !v)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] font-medium cursor-pointer transition-all"
          style={{
            backgroundColor: followUpDue ? 'var(--warning-subtle)' : 'var(--surface)',
            borderColor: followUpDue ? 'var(--warning)' : 'var(--border)',
            color: followUpDue ? 'var(--warning)' : 'var(--text-secondary)',
          }}
        >
          <CalendarClock size={14} /> Due for follow-up
        </motion.button>

        {/* Quick status chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.keys(STATUS_CONFIG) as LeadStatus[]).map((s) => {
            const cfg = STATUS_CONFIG[s];
            const count = leads.filter((l) => (l.status || 'new') === s).length;
            if (count === 0) return null;
            return (
              <motion.button
                key={s}
                type="button"
                onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium cursor-pointer transition-all"
                style={{
                  backgroundColor: statusFilter === s ? cfg.bg : 'transparent',
                  borderColor: statusFilter === s ? cfg.border : 'var(--border-muted)',
                  color: statusFilter === s ? cfg.text : 'var(--text-muted)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
                {cfg.label} <span>({count})</span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ── Table ───────────────────────────────────────────── */}
      <div className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>

        {/* Table header */}
        <div className="hidden md:grid md:grid-cols-12 px-5 py-3 text-[11px] uppercase tracking-widest font-semibold border-b"
          style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', backgroundColor: 'var(--surface-muted)' }}>
          <div className="col-span-2">Lead</div>
          <div className="col-span-2">Contact</div>
          <div className="col-span-1">Assigned</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Score</div>
          <div className="col-span-2">Follow-up</div>
          <div className="col-span-1">Source</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{ backgroundColor: 'var(--surface-muted)' }}>
              <Users2 size={20} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="font-medium text-[14px]" style={{ color: 'var(--text-secondary)' }}>No leads found</p>
            <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Add your first lead to get started'}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredLeads.map((lead, idx) => {
              const s     = (lead.status || 'new') as LeadStatus;
              const cfg   = STATUS_CONFIG[s];
              const score = Math.max(0, Math.min(100, Number(lead.score || 0)));

              return (
                <motion.div
                  key={lead._id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(idx * 0.03, 0.2) }}
                  whileHover={{ backgroundColor: 'var(--surface-muted)' }}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 px-5 py-4 border-b transition-colors cursor-pointer"
                  style={{ borderColor: 'var(--border-muted)' }}
                >
                  {/* Lead info */}
                  <div className="md:col-span-2 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold text-white"
                      style={{ backgroundColor: 'var(--accent)' }}>
                      {(lead.name || 'U')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {lead.name || 'Unnamed Lead'}
                      </p>
                      {lead.company && (
                        <p className="flex items-center gap-1 text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          <Building2 size={10} /> {lead.company}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="md:col-span-2 flex flex-col justify-center gap-1">
                    {lead.email && (
                      <p className="flex items-center gap-1.5 text-[12px] truncate" style={{ color: 'var(--text-secondary)' }}>
                        <Mail size={11} style={{ color: 'var(--text-muted)' }} /> {lead.email}
                      </p>
                    )}
                    {lead.phone && (
                      <p className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        <Phone size={11} /> {lead.phone}
                      </p>
                    )}
                  </div>

                  {/* Assigned */}
                  <div className="md:col-span-1 flex items-center">
                    {lead.assignedTo ? (
                      <span className="flex items-center gap-1 text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                        <User size={10} /> {(lead.assignedTo as { name?: string }).name || '—'}
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="md:col-span-2 flex items-center">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                      style={{ backgroundColor: cfg.bg, color: cfg.text, borderColor: cfg.border }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Score */}
                  <div className="md:col-span-1 flex items-center gap-2.5">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'var(--surface-muted)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${score}%`, backgroundColor: scoreColor(score) }}
                      />
                    </div>
                    <span className="text-[12px] font-semibold w-7 text-right"
                      style={{ color: scoreColor(score) }}>{score}</span>
                  </div>

                  {/* Follow-up */}
                  <div className="md:col-span-2 flex items-center gap-1">
                    {lead.followUpAt ? (
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: new Date(lead.followUpAt) <= new Date() ? 'var(--error)' : 'var(--text-muted)' }}>
                        <CalendarClock size={11} />
                        {new Date(lead.followUpAt).toLocaleDateString()}
                        {lead.followUpNote && (
                          <span className="truncate max-w-[80px]" title={lead.followUpNote}> · {lead.followUpNote}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </div>

                  {/* Source */}
                  <div className="md:col-span-1 flex items-center">
                    <span className="flex items-center gap-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      <Zap size={11} /> {lead.source || 'Manual'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="md:col-span-1 flex items-center justify-end gap-2">
                    <select
                      value={s}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateLeadStatus(lead._id, e.target.value as LeadStatus)}
                      className="px-2 py-1 rounded-md border text-[11px] focus:outline-none cursor-pointer"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {(Object.keys(STATUS_CONFIG) as LeadStatus[]).map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {STATUS_CONFIG[statusOption].label}
                        </option>
                      ))}
                    </select>
                    <motion.button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteLead(lead._id, lead.name);
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="p-1.5 rounded-md cursor-pointer"
                      style={{ color: 'var(--error)' }}
                      title="Delete lead"
                    >
                      <Trash2 size={15} />
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      {!loading && filteredLeads.length > 0 && (
        <p className="text-[12px] text-right" style={{ color: 'var(--text-muted)' }}>
          Showing {filteredLeads.length} of {leads.length} leads
        </p>
      )}

      {/* ── Add Lead Modal ─────────────────────────────────── */}
      <AnimatePresence>
        {addModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => setAddModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-xl border shadow-xl"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Add Lead</h2>
                <button type="button" onClick={() => setAddModalOpen(false)} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleSubmit(onSubmitAdd)} className="p-5 space-y-4">
                <div>
                  <label className="block text-[12px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Name *</label>
                  <input
                    {...register('name')}
                    className="w-full px-3 py-2 rounded-lg border text-[13px] focus:outline-none"
                    style={{ backgroundColor: 'var(--surface)', borderColor: errors.name ? 'var(--error)' : 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="Full name"
                  />
                  {errors.name && <p className="mt-1 text-[11px]" style={{ color: 'var(--error)' }}>{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Email *</label>
                  <input
                    {...register('email')}
                    type="email"
                    className="w-full px-3 py-2 rounded-lg border text-[13px] focus:outline-none"
                    style={{ backgroundColor: 'var(--surface)', borderColor: errors.email ? 'var(--error)' : 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="email@example.com"
                  />
                  {errors.email && <p className="mt-1 text-[11px]" style={{ color: 'var(--error)' }}>{errors.email.message}</p>}
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Phone *</label>
                  <input
                    {...register('phone')}
                    className="w-full px-3 py-2 rounded-lg border text-[13px] focus:outline-none"
                    style={{ backgroundColor: 'var(--surface)', borderColor: errors.phone ? 'var(--error)' : 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="+1 234 567 8900"
                  />
                  {errors.phone && <p className="mt-1 text-[11px]" style={{ color: 'var(--error)' }}>{errors.phone.message}</p>}
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Company</label>
                  <input
                    {...register('company')}
                    className="w-full px-3 py-2 rounded-lg border text-[13px] focus:outline-none"
                    style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Source</label>
                  <select
                    {...register('source')}
                    className="w-full px-3 py-2 rounded-lg border text-[13px] focus:outline-none"
                    style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <option value="website">Website</option>
                    <option value="referral">Referral</option>
                    <option value="social">Social</option>
                    <option value="email">Email</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg border text-[13px] font-medium"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {createMutation.isPending ? 'Creating…' : 'Create Lead'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
