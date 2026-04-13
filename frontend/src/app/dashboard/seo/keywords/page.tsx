'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Target, Plus, Pencil, Trash2, X, Search,
    ChevronLeft, ChevronRight, Check, AlertCircle,
    TrendingUp, TrendingDown, Minus, BarChart2,
} from 'lucide-react';
import api from '@/lib/api';
import { showConfirm } from '@/lib/sweetalert';

interface Keyword {
    _id: string;
    keyword: string;
    pagePath?: string;
    targetUrl?: string;
    searchVolume: number;
    difficulty: number;
    currentRank: number | null;
    previousRank: number | null;
    impressions?: number | null;
    clicks?: number | null;
    ctr?: number | null;
    avgPosition?: number | null;
    status: string;
    notes: string;
    updatedAt: string;
}

interface Pagination { page: number; limit: number; total: number; totalPages: number; }
interface KeywordStats { total: number; tracking: number; ranked: number; lost: number; new: number; avgDifficulty: number; }

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    new: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: 'New' },
    tracking: { color: 'var(--accent)', bg: 'var(--accent-subtle)', label: 'Tracking' },
    ranked: { color: 'var(--success, #22c55e)', bg: 'rgba(34,197,94,0.1)', label: 'Ranked' },
    lost: { color: 'var(--error, #ef4444)', bg: 'rgba(239,68,68,0.1)', label: 'Lost' },
};

function getDifficultyColor(d: number) {
    if (d <= 30) return 'var(--success, #22c55e)';
    if (d <= 60) return 'var(--warning, #f59e0b)';
    return 'var(--error, #ef4444)';
}

const EMPTY_FORM = {
    keyword: '',
    pagePath: '',
    searchVolume: 0,
    difficulty: 0,
    currentRank: '',
    impressions: 0,
    clicks: 0,
    avgPosition: 0,
    status: 'new',
    notes: '',
};

export default function SeoKeywordsPage() {
    const [items, setItems] = useState<Keyword[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 15, total: 0, totalPages: 0 });
    const [stats, setStats] = useState<KeywordStats | null>(null);
    const [clusters, setClusters] = useState<Array<{ _id: string; count: number; keywords: string[] }>>([]);
    const [opportunities, setOpportunities] = useState<Keyword[]>([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [view, setView] = useState<'table' | 'opportunities' | 'clusters'>('table');
    const [secondaryLoading, setSecondaryLoading] = useState(false);

    const fetchData = useCallback(async (page = 1) => {
        setLoading(true); setError(null);
        try {
            const [kwRes, statsRes] = await Promise.all([
                api.get('/seo/keywords', { params: { page, limit: pagination.limit, search, sort: '-updatedAt', status: statusFilter || undefined } }),
                api.get('/seo/keywords/stats'),
            ]);
            setItems(kwRes.data.data?.keywords || []);
            setPagination(kwRes.data.data?.pagination || { page: 1, limit: 15, total: 0, totalPages: 0 });
            setStats(statsRes.data.data);
        } catch { setError('Failed to load keywords'); }
        finally { setLoading(false); }
    }, [search, statusFilter, pagination.limit]);

    const fetchSecondary = useCallback(async () => {
        setSecondaryLoading(true);
        try {
            const [clustersRes, oppRes] = await Promise.all([
                api.get('/seo/keywords/clusters'),
                api.get('/seo/keywords/opportunities', { params: { limit: 50 } }),
            ]);
            setClusters(clustersRes.data.data || []);
            setOpportunities(oppRes.data.data || []);
        } catch {
            // optional views; ignore errors
        } finally {
            setSecondaryLoading(false);
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => fetchData(1), 300);
        return () => clearTimeout(t);
    }, [search, statusFilter, fetchData]);

    useEffect(() => {
        if (view !== 'table' && !secondaryLoading && clusters.length === 0 && opportunities.length === 0) {
            fetchSecondary();
        }
    }, [view, secondaryLoading, clusters.length, opportunities.length, fetchSecondary]);

    const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true); };
    const openEdit = (kw: Keyword) => {
        setEditingId(kw._id);
        setForm({
            keyword: kw.keyword,
            pagePath: (kw.targetUrl ?? kw.pagePath) ?? '',
            searchVolume: kw.searchVolume,
            difficulty: kw.difficulty,
            currentRank: kw.currentRank?.toString() ?? '',
            impressions: kw.impressions ?? 0,
            clicks: kw.clicks ?? 0,
            avgPosition: kw.avgPosition ?? 0,
            status: kw.status,
            notes: kw.notes ?? '',
        });
        setFormError(null); setModalOpen(true);
    };

    const handleSave = async () => {
        if (!form.keyword.trim()) {
            setFormError('Keyword is required');
            return;
        }
        if (form.difficulty < 0 || form.difficulty > 100) {
            setFormError('Difficulty must be between 0 and 100');
            return;
        }
        if (form.searchVolume < 0) {
            setFormError('Search volume cannot be negative');
            return;
        }
        if (form.impressions != null && form.impressions < 0) {
            setFormError('Impressions cannot be negative');
            return;
        }
        if (form.clicks != null && form.clicks < 0) {
            setFormError('Clicks cannot be negative');
            return;
        }
        if (form.avgPosition != null && form.avgPosition < 0) {
            setFormError('Avg position cannot be negative');
            return;
        }
        if (form.currentRank) {
            const rankNumber = Number(form.currentRank);
            if (!Number.isFinite(rankNumber) || rankNumber < 1) {
                setFormError('Current rank must be a positive number');
                return;
            }
        }
        setSaving(true); setFormError(null);
        try {
            const payload = {
                ...form,
                currentRank: form.currentRank ? Number(form.currentRank) : null,
                impressions: typeof form.impressions === 'number' ? form.impressions : undefined,
                clicks: typeof form.clicks === 'number' ? form.clicks : undefined,
                avgPosition: typeof form.avgPosition === 'number' ? form.avgPosition : undefined,
            };
            if (editingId) await api.put(`/seo/keywords/${editingId}`, payload);
            else await api.post('/seo/keywords', payload);
            setModalOpen(false); fetchData(pagination.page);
        } catch (err: unknown) {
            setFormError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save');
        } finally { setSaving(false); }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try { await api.delete(`/seo/keywords/${id}`); fetchData(pagination.page); }
        catch { setError('Failed to delete'); }
        finally { setDeletingId(null); }
    };

    const requestDelete = async (id: string) => {
        const result = await showConfirm('Delete keyword?', 'This will permanently delete this tracked keyword.');
        if (!result.isConfirmed) return;
        await handleDelete(id);
    };

    const inputStyle: React.CSSProperties = {
        backgroundColor: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', color: 'var(--text-primary)',
    };

    const statCards = stats ? [
        { label: 'Total', value: stats.total, color: 'var(--accent)' },
        { label: 'Ranked', value: stats.ranked, color: 'var(--success, #22c55e)' },
        { label: 'Tracking', value: stats.tracking, color: 'var(--accent)' },
        { label: 'Lost', value: stats.lost, color: 'var(--error, #ef4444)' },
        { label: 'Avg Difficulty', value: stats.avgDifficulty, color: getDifficultyColor(stats.avgDifficulty) },
    ] : [];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
            className="p-6 min-h-screen" style={{ backgroundColor: 'var(--bg)', color: 'var(--text-primary)' }}>

            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <motion.div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-subtle)' }}
                            whileHover={{ rotate: [0, -8, 8, 0], scale: 1.08 }} transition={{ duration: 0.4 }}>
                            <Target size={22} style={{ color: 'var(--accent)' }} />
                        </motion.div>
                        Keyword Tracker
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Track target keywords, rankings, and search volume</p>
                </div>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white self-start"
                    style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover, var(--accent)))', boxShadow: '0 4px 14px rgba(74,122,155,0.3)' }}>
                    <Plus size={16} /> Add Keyword
                </motion.button>
            </motion.div>

            {/* Stat Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                    {statCards.map((s, i) => (
                        <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }} whileHover={{ y: -3, scale: 1.01, transition: { duration: 0.15 } }}
                            className="border rounded-xl p-3" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                            <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Sub-tabs: Search Console style views */}
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex flex-wrap gap-2"
            >
                {[
                    { id: 'table' as const, label: 'All Keywords' },
                    { id: 'opportunities' as const, label: 'Opportunities' },
                    { id: 'clusters' as const, label: 'Clusters' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setView(tab.id)}
                        className="px-3 py-1.5 rounded-full text-xs md:text-sm border cursor-pointer"
                        style={{
                            backgroundColor: view === tab.id ? 'var(--accent-subtle)' : 'var(--surface)',
                            borderColor: view === tab.id ? 'var(--accent)' : 'var(--border)',
                            color: view === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </motion.div>

            {/* Search + Filter (table view only) */}
            {view === 'table' && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 flex gap-3">
                    <div className="relative flex-1 max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                        <input type="text" placeholder="Search keywords…" value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                    </div>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
                        <option value="">All Statuses</option>
                        <option value="new">New</option>
                        <option value="tracking">Tracking</option>
                        <option value="ranked">Ranked</option>
                        <option value="lost">Lost</option>
                    </select>
                </motion.div>
            )}

            {error && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-4 mb-5 flex items-center gap-3"
                    style={{ backgroundColor: 'var(--error-subtle, rgba(239,68,68,0.1))', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--error, #ef4444)' }}>
                    <AlertCircle size={18} style={{ color: 'var(--error, #ef4444)' }} />
                    <p className="text-sm" style={{ color: 'var(--error, #ef4444)' }}>{error}</p>
                </motion.div>
            )}

            {/* Table view */}
            {view === 'table' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="border rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>

                <div className="grid grid-cols-12 gap-3 px-5 py-3 text-xs font-semibold uppercase tracking-wider border-b"
                    style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}>
                    <div className="col-span-3">Keyword</div>
                    <div className="col-span-2">Page</div>
                    <div className="col-span-1 text-center">Volume</div>
                    <div className="col-span-1 text-center">Difficulty</div>
                    <div className="col-span-1 text-center">Rank</div>
                    <div className="col-span-1 text-center">Trend</div>
                    <div className="col-span-1 text-center">Status</div>
                    <div className="col-span-2 text-right">Actions</div>
                </div>

                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {loading ? Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="px-5 py-3.5">
                            <div className="animate-pulse rounded w-full h-4" style={{ backgroundColor: 'var(--surface-muted)' }} />
                        </div>
                    )) : items.length === 0 ? (
                        <div className="px-5 py-16 text-center">
                            <Target size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{search || statusFilter ? 'No results' : 'No keywords tracked yet'}</p>
                            {!search && !statusFilter && <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={openCreate}
                                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: 'var(--accent)' }}>
                                Track First Keyword</motion.button>}
                        </div>
                    ) : items.map((kw, i) => {
                        const rankDiff = kw.previousRank && kw.currentRank ? kw.previousRank - kw.currentRank : 0;
                        const cfg = STATUS_CONFIG[kw.status] || STATUS_CONFIG.new;
                        return (
                            <motion.div key={kw._id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.18, delay: i * 0.02 }}
                                className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center transition-colors"
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg)')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                                <div className="col-span-3 text-sm font-medium truncate">{kw.keyword}</div>
                                <div className="col-span-2 text-xs truncate" style={{ color: 'var(--text-muted)' }}>{kw.targetUrl ?? kw.pagePath ?? '—'}</div>
                                <div className="col-span-1 text-center text-sm font-mono">{kw.searchVolume.toLocaleString()}</div>
                                <div className="col-span-1 flex justify-center">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-10 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-muted)' }}>
                                            <div className="h-full rounded-full" style={{ width: `${kw.difficulty}%`, backgroundColor: getDifficultyColor(kw.difficulty) }} />
                                        </div>
                                        <span className="text-xs font-mono" style={{ color: getDifficultyColor(kw.difficulty) }}>{kw.difficulty}</span>
                                    </div>
                                </div>
                                <div className="col-span-1 text-center text-sm font-bold">{kw.currentRank || '—'}</div>
                                <div className="col-span-1 flex flex-col items-center justify-center gap-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    <div>
                                        {rankDiff > 0 ? <TrendingUp size={14} style={{ color: 'var(--success, #22c55e)' }} /> :
                                            rankDiff < 0 ? <TrendingDown size={14} style={{ color: 'var(--error, #ef4444)' }} /> :
                                                <Minus size={14} style={{ color: 'var(--text-muted)' }} />}
                                    </div>
                                    <div className="font-mono">
                                        {(() => {
                                            const imp = kw.impressions ?? null;
                                            const clicks = kw.clicks ?? null;
                                            const ctr = kw.ctr != null
                                                ? kw.ctr
                                                : imp && imp > 0 && clicks != null
                                                    ? (clicks / imp) * 100
                                                    : null;
                                            if (!imp && !clicks && ctr == null) return '—';
                                            return `${imp ?? 0} imp · ${clicks ?? 0} clk · ${ctr != null ? ctr.toFixed(1) : '—'}%`;
                                        })()}
                                    </div>
                                </div>
                                <div className="col-span-1 flex justify-center">
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                        style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                </div>
                                <div className="col-span-2 flex justify-end gap-1.5">
                                    <motion.button whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }} onClick={() => openEdit(kw)}
                                        className="p-1.5 rounded-lg" style={{ color: 'var(--accent)' }}><Pencil size={14} /></motion.button>
                                    <motion.button whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }}
                                        onClick={() => requestDelete(kw._id)}
                                        disabled={deletingId === kw._id}
                                        className="p-1.5 rounded-lg" style={{ color: 'var(--error, #ef4444)', opacity: deletingId === kw._id ? 0.5 : 1 }}>
                                        <Trash2 size={14} /></motion.button>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {!loading && pagination.totalPages > 1 && (
                    <div className="px-5 py-3 flex items-center justify-between border-t" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                        </p>
                        <div className="flex items-center gap-1">
                            <button onClick={() => fetchData(pagination.page - 1)} disabled={pagination.page <= 1}
                                className="p-1.5 rounded-lg disabled:opacity-30" style={{ color: 'var(--text-muted)' }}><ChevronLeft size={16} /></button>
                            {Array.from({ length: Math.min(pagination.totalPages, 5) }).map((_, i) => {
                                const p = i + 1;
                                return <button key={p} onClick={() => fetchData(p)}
                                    className="w-7 h-7 rounded-lg text-xs font-semibold"
                                    style={{ backgroundColor: p === pagination.page ? 'var(--accent)' : 'transparent', color: p === pagination.page ? '#fff' : 'var(--text-muted)' }}>{p}</button>;
                            })}
                            <button onClick={() => fetchData(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                                className="p-1.5 rounded-lg disabled:opacity-30" style={{ color: 'var(--text-muted)' }}><ChevronRight size={16} /></button>
                        </div>
                    </div>
                )}
            </motion.div>
            )}

            {/* Opportunities view */}
            {view === 'opportunities' && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border rounded-2xl overflow-hidden"
                    style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                    <div className="flex items-center justify-between px-5 py-3 border-b"
                        style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <BarChart2 size={16} />
                            <span>Keyword opportunities</span>
                        </div>
                        {secondaryLoading && (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</span>
                        )}
                    </div>
                    {opportunities.length === 0 ? (
                        <div className="px-5 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                            No opportunity keywords found yet. Add keywords with volume or low difficulty to see them here.
                        </div>
                    ) : (
                        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                            {opportunities.map((kw, i) => (
                                <div key={kw._id || `${kw.keyword}-${i}`} className="px-5 py-3 flex items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{kw.keyword}</p>
                                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                                            {kw.targetUrl || kw.pagePath || 'No target page set'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                                        <div className="text-right">
                                            <div>Volume</div>
                                            <div className="font-mono text-sm">{(kw.searchVolume ?? 0).toLocaleString()}</div>
                                        </div>
                                        <div className="text-right">
                                            <div>Difficulty</div>
                                            <div className="font-mono text-sm" style={{ color: getDifficultyColor(kw.difficulty ?? 0) }}>
                                                {kw.difficulty ?? '—'}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div>Rank</div>
                                            <div className="font-mono text-sm">{kw.currentRank ?? '—'}</div>
                                        </div>
                                        {kw._id && (
                                            <button
                                                className="px-3 py-1.5 rounded-lg border text-xs cursor-pointer"
                                                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                                                onClick={() => openEdit(kw as Keyword)}
                                            >
                                                Edit
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            )}

            {/* Clusters view */}
            {view === 'clusters' && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border rounded-2xl overflow-hidden"
                    style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                    <div className="flex items-center justify-between px-5 py-3 border-b"
                        style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <BarChart2 size={16} />
                            <span>Keyword clusters</span>
                        </div>
                        {secondaryLoading && (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</span>
                        )}
                    </div>
                    {clusters.length === 0 ? (
                        <div className="px-5 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                            No clusters defined yet. Add a cluster name to your keywords to see grouped topics here.
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-4 p-5">
                            {clusters.map((c) => (
                                <div
                                    key={c._id}
                                    className="rounded-xl border p-4 flex flex-col gap-2"
                                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-muted)' }}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-semibold truncate">{c._id}</p>
                                        <span className="text-xs px-2 py-0.5 rounded-full"
                                            style={{
                                                backgroundColor: 'var(--accent-subtle)',
                                                color: 'var(--accent)',
                                            }}
                                        >
                                            {c.count} keyword{c.count !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                        {c.keywords.slice(0, 4).join(' • ')}
                                        {c.keywords.length > 4 && ' …'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            )}

            {/* Modal */}
            <AnimatePresence>
                {modalOpen && (
                    <motion.div key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                        onClick={() => setModalOpen(false)}>
                        <motion.div key="modal" initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                            className="w-full max-w-lg rounded-2xl border p-6"
                            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-lg font-bold">{editingId ? 'Edit Keyword' : 'Add Keyword'}</h2>
                                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setModalOpen(false)}
                                    className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}><X size={18} /></motion.button>
                            </div>

                            {formError && (
                                <div className="rounded-lg p-3 mb-4 flex items-center gap-2 text-sm"
                                    style={{ backgroundColor: 'var(--error-subtle, rgba(239,68,68,0.1))', color: 'var(--error, #ef4444)' }}>
                                    <AlertCircle size={14} /> {formError}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Keyword *</label>
                                    <input type="text" placeholder="e.g. react development" value={form.keyword}
                                        onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Target Page Path</label>
                                    <input type="text" placeholder="/services" value={form.pagePath}
                                        onChange={(e) => setForm({ ...form, pagePath: e.target.value })}
                                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Search Volume</label>
                                        <input type="number" min={0} value={form.searchVolume}
                                            onChange={(e) => setForm({ ...form, searchVolume: Number(e.target.value) })}
                                            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Difficulty (0–100)</label>
                                        <input type="number" min={0} max={100} value={form.difficulty}
                                            onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}
                                            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Current Rank</label>
                                        <input type="number" min={1} placeholder="—" value={form.currentRank}
                                            onChange={(e) => setForm({ ...form, currentRank: e.target.value })}
                                            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Status</label>
                                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
                                        <option value="new">New</option>
                                        <option value="tracking">Tracking</option>
                                        <option value="ranked">Ranked</option>
                                        <option value="lost">Lost</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Notes</label>
                                    <input type="text" placeholder="Optional notes" value={form.notes}
                                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg)' }}>Cancel</motion.button>
                                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={saving}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                                    style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover, var(--accent)))', boxShadow: '0 4px 14px rgba(74,122,155,0.3)' }}>
                                    <Check size={14} /> {saving ? 'Saving…' : editingId ? 'Update' : 'Add'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
