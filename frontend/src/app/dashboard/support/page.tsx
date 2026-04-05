'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, Variants } from 'framer-motion';
import {
  LifeBuoy,
  Ticket,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import api from '@/lib/api';

interface TicketStats {
  open: number;
  inProgress: number;
  resolved: number;
  critical: number;
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
};

export default function SupportOverviewPage() {
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ data: TicketStats }>('/tickets/stats');
      setStats(data?.data ?? null);
    } catch {
      setError('Failed to load ticket stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const openTotal = stats ? stats.open + stats.inProgress : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-6 min-h-screen"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text-primary)' }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 rounded-xl"
            style={{ backgroundColor: 'var(--accent-subtle)' }}
          >
            <LifeBuoy size={24} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Support Overview</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Tickets and customer conversations
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </motion.div>

      {error && (
        <div
          className="mb-6 px-4 py-3 rounded-xl flex items-center gap-2"
          style={{ backgroundColor: 'var(--error-subtle)', border: '1px solid var(--error-border)', color: 'var(--error)' }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.05 }}
          className="rounded-2xl border p-5"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Open
            </span>
            <Clock size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {loading ? '—' : (stats?.open ?? 0)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Awaiting response
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.1 }}
          className="rounded-2xl border p-5"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              In progress
            </span>
            <Ticket size={18} style={{ color: 'var(--warning)' }} />
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {loading ? '—' : (stats?.inProgress ?? 0)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Being worked on
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.15 }}
          className="rounded-2xl border p-5"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Resolved
            </span>
            <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {loading ? '—' : (stats?.resolved ?? 0)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Closed
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.2 }}
          className="rounded-2xl border p-5"
          style={{
            backgroundColor: stats?.critical ? 'var(--error-subtle)' : 'var(--surface)',
            borderColor: stats?.critical ? 'var(--error-border)' : 'var(--border)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Critical
            </span>
            <AlertCircle size={18} style={{ color: 'var(--error)' }} />
          </div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: stats?.critical ? 'var(--error)' : undefined }}>
            {loading ? '—' : (stats?.critical ?? 0)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Needs attention
          </p>
        </motion.div>
      </div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <Link
          href="/dashboard/tickets"
          className="rounded-2xl border p-6 flex items-center justify-between gap-4 transition-all hover:opacity-90 group"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-4">
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <Ticket size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Tickets</h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {openTotal > 0
                  ? `${openTotal} open ticket${openTotal !== 1 ? 's' : ''} to manage`
                  : 'View and manage support tickets'}
              </p>
            </div>
          </div>
          <ArrowRight
            size={20}
            className="flex-shrink-0 transition-transform group-hover:translate-x-1"
            style={{ color: 'var(--text-muted)' }}
          />
        </Link>

        <Link
          href="/dashboard/chatbot"
          className="rounded-2xl border p-6 flex items-center justify-between gap-4 transition-all hover:opacity-90 group"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-4">
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <Sparkles size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Chatbot</h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                FAQs, config and live chat sessions
              </p>
            </div>
          </div>
          <ArrowRight
            size={20}
            className="flex-shrink-0 transition-transform group-hover:translate-x-1"
            style={{ color: 'var(--text-muted)' }}
          />
        </Link>
      </motion.div>
    </motion.div>
  );
}
