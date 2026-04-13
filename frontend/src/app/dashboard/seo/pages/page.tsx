'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight,
    Eye, EyeOff, AlertCircle, Check, FileText, Copy, History, Send,
} from 'lucide-react';
import api from '@/lib/api';
import { showConfirm } from '@/lib/sweetalert';

const PAGE_STATUSES = ['draft', 'review', 'approved', 'published', 'archived'] as const;
type PageStatus = typeof PAGE_STATUSES[number];

interface SeoEntry {
    _id: string;
    pagePath?: string;
    routePath?: string;
    metaTitle?: string;
    title?: string;
    metaDescription?: string;
    keywords?: string[];
    metaKeywords?: string[];
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogType?: string;
    canonicalUrl?: string;
    robots?: string;
    robotsDirectives?: string;
    structuredData: unknown;
    isPublished?: boolean;
    status?: PageStatus;
    updatedAt: string;
    lastModifiedBy?: { name: string; email: string };
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

const EMPTY_FORM = {
    pagePath: '',
    metaTitle: '',
    metaDescription: '',
    keywords: '',
    ogTitle: '',
    ogDescription: '',
    ogImage: '',
    ogType: 'website',
    canonicalUrl: '',
    robots: 'index, follow',
    structuredData: '',
    isPublished: true,
    status: 'draft' as PageStatus,
};

export default function SeoPagesPage() {
    const [pages, setPages] = useState<SeoEntry[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 15, total: 0, totalPages: 0 });
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [publishingId, setPublishingId] = useState<string | null>(null);
    const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
    const [versionsEntryId, setVersionsEntryId] = useState<string | null>(null);
    const [versions, setVersions] = useState<{ versionNumber: number; snapshot: Record<string, unknown>; createdAt: string }[]>([]);

    const fetchPages = useCallback(async (page = 1) => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string | number> = { page, limit: pagination.limit, search, sort: '-updatedAt' };
            if (statusFilter) params.status = statusFilter;
            const res = await api.get('/seo/pages', { params });
            setPages(res.data.data?.pages || []);
            setPagination(res.data.data?.pagination || { page: 1, limit: 15, total: 0, totalPages: 0 });
        } catch {
            setError('Failed to load SEO pages');
        } finally {
            setLoading(false);
        }
    }, [search, statusFilter, pagination.limit]);

    useEffect(() => {
        const timeout = setTimeout(() => fetchPages(1), 300);
        return () => clearTimeout(timeout);
    }, [search, statusFilter, fetchPages]);

    const openCreate = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setFormError(null);
        setModalOpen(true);
    };

    const openEdit = (entry: SeoEntry) => {
        setEditingId(entry._id);
        const path = entry.pagePath ?? entry.routePath ?? '';
        const title = entry.metaTitle ?? entry.title ?? '';
        const keywords = entry.metaKeywords ?? entry.keywords ?? [];
        setForm({
            pagePath: path,
            metaTitle: title,
            metaDescription: entry.metaDescription ?? '',
            keywords: Array.isArray(keywords) ? keywords.join(', ') : '',
            ogTitle: entry.ogTitle ?? '',
            ogDescription: entry.ogDescription ?? '',
            ogImage: entry.ogImage ?? '',
            ogType: entry.ogType ?? 'website',
            canonicalUrl: entry.canonicalUrl ?? '',
            robots: entry.robots ?? entry.robotsDirectives ?? 'index, follow',
            structuredData: entry.structuredData ? JSON.stringify(entry.structuredData, null, 2) : '',
            isPublished: entry.status === 'published' || entry.isPublished === true,
            status: (entry.status as PageStatus) ?? 'draft',
        });
        setFormError(null);
        setModalOpen(true);
    };

    const handlePublish = async (id: string) => {
        setPublishingId(id);
        try {
            await api.post(`/seo/pages/${id}/publish`);
            fetchPages(pagination.page);
        } catch {
            setError('Failed to publish (check seo.publish permission)');
        } finally {
            setPublishingId(null);
        }
    };

    const handleDuplicate = async (id: string) => {
        setDuplicatingId(id);
        try {
            await api.post(`/seo/pages/${id}/duplicate`);
            fetchPages(1);
        } catch {
            setError('Failed to duplicate');
        } finally {
            setDuplicatingId(null);
        }
    };

    const openVersions = async (id: string) => {
        setVersionsEntryId(id);
        try {
            const res = await api.get(`/seo/pages/${id}/versions`);
            setVersions(res.data?.data ?? []);
        } catch {
            setVersions([]);
        }
    };

    const handleSave = async () => {
        const trimmedPath = form.pagePath.trim();
        if (!trimmedPath) {
            setFormError('Page path is required');
            return;
        }
        if (!trimmedPath.startsWith('/')) {
            setFormError('Page path must start with "/"');
            return;
        }
        if (form.metaTitle && form.metaTitle.length > 120) {
            setFormError('Meta title must be at most 120 characters');
            return;
        }
        if (form.metaDescription && form.metaDescription.length > 320) {
            setFormError('Meta description must be at most 320 characters');
            return;
        }
        if (form.structuredData) {
            try {
                // Validate JSON before sending to backend
                JSON.parse(form.structuredData);
            } catch {
                setFormError('Structured data must be valid JSON');
                return;
            }
        }
        setSaving(true);
        setFormError(null);
        try {
            const keywordsArr = form.keywords
                .split(',')
                .map((k) => k.trim())
                .filter(Boolean);
            const payload = {
                ...form,
                pagePath: trimmedPath,
                routePath: trimmedPath,
                metaKeywords: keywordsArr,
                keywords: keywordsArr,
                structuredData: form.structuredData ? JSON.parse(form.structuredData) : null,
                status: form.status || (form.isPublished ? 'published' : 'draft'),
            };

            if (editingId) {
                await api.put(`/seo/pages/${editingId}`, payload);
            } else {
                await api.post('/seo/pages', payload);
            }

            setModalOpen(false);
            fetchPages(pagination.page);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save';
            setFormError(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            await api.delete(`/seo/pages/${id}`);
            fetchPages(pagination.page);
        } catch {
            setError('Failed to delete entry');
        } finally {
            setDeletingId(null);
        }
    };

    const requestDelete = async (id: string) => {
        const result = await showConfirm('Delete SEO entry?', 'This will permanently delete this SEO entry.');
        if (!result.isConfirmed) return;
        await handleDelete(id);
    };

    const inputStyle: React.CSSProperties = {
        backgroundColor: 'var(--bg)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--border)',
        color: 'var(--text-primary)',
    };

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
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
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
                        SEO Pages
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                        Create and edit SEO metadata for each page
                    </p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-shadow self-start"
                    style={{
                        background: 'linear-gradient(135deg, var(--accent), var(--accent-hover, var(--accent)))',
                        boxShadow: '0 4px 14px rgba(74, 122, 155, 0.3)',
                    }}
                >
                    <Plus size={16} />
                    New SEO Entry
                </motion.button>
            </motion.div>

            {/* Search + Status filter */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 flex flex-col sm:flex-row gap-3"
            >
                <div className="relative max-w-md flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Search by path or title…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors"
                        style={inputStyle}
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2.5 rounded-xl text-sm outline-none min-w-[140px]"
                    style={inputStyle}
                >
                    <option value="">All statuses</option>
                    {PAGE_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </motion.div>

            {/* Error */}
            {error && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-4 mb-5 flex items-center gap-3"
                    style={{
                        backgroundColor: 'var(--error-subtle, rgba(239,68,68,0.1))',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: 'var(--error, #ef4444)',
                    }}
                >
                    <AlertCircle size={18} style={{ color: 'var(--error, #ef4444)' }} />
                    <p className="text-sm" style={{ color: 'var(--error, #ef4444)' }}>{error}</p>
                </motion.div>
            )}

            {/* Table */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="border rounded-2xl overflow-hidden"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            >
                {/* Table Header */}
                <div
                    className="grid grid-cols-12 gap-3 px-5 py-3 text-xs font-semibold uppercase tracking-wider border-b"
                    style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
                >
                    <div className="col-span-3">Page Path</div>
                    <div className="col-span-3">Meta Title</div>
                    <div className="col-span-3">Description</div>
                    <div className="col-span-1 text-center">Status</div>
                    <div className="col-span-2 text-right">Actions</div>
                </div>

                {/* Table Body */}
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {loading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center">
                                <div className="col-span-3"><div className="animate-pulse rounded w-32 h-4" style={{ backgroundColor: 'var(--surface-muted)' }} /></div>
                                <div className="col-span-3"><div className="animate-pulse rounded w-40 h-4" style={{ backgroundColor: 'var(--surface-muted)' }} /></div>
                                <div className="col-span-3"><div className="animate-pulse rounded w-48 h-3" style={{ backgroundColor: 'var(--surface-muted)' }} /></div>
                                <div className="col-span-1 flex justify-center"><div className="animate-pulse rounded-full w-14 h-5" style={{ backgroundColor: 'var(--surface-muted)' }} /></div>
                                <div className="col-span-2 flex justify-end gap-2"><div className="animate-pulse rounded w-7 h-7" style={{ backgroundColor: 'var(--surface-muted)' }} /><div className="animate-pulse rounded w-7 h-7" style={{ backgroundColor: 'var(--surface-muted)' }} /></div>
                            </div>
                        ))
                    ) : pages.length === 0 ? (
                        <div className="px-5 py-16 text-center">
                            <Search size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
                            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                                {search ? 'No results found' : 'No SEO entries yet'}
                            </p>
                            {!search && (
                                <motion.button
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.96 }}
                                    onClick={openCreate}
                                    className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-white"
                                    style={{ backgroundColor: 'var(--accent)' }}
                                >
                                    Create First Entry
                                </motion.button>
                            )}
                        </div>
                    ) : (
                        pages.map((entry, i) => (
                            <motion.div
                                key={entry._id}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.18, delay: i * 0.02 }}
                                className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center transition-colors group"
                                style={{ cursor: 'default' }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg)')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                            >
                                <div className="col-span-3 text-sm font-medium truncate">{entry.pagePath ?? entry.routePath}</div>
                                <div className="col-span-3 text-sm truncate" style={{ color: 'var(--text-muted)' }}>{entry.metaTitle ?? entry.title ?? '—'}</div>
                                <div className="col-span-3 text-xs truncate" style={{ color: 'var(--text-muted)' }}>{entry.metaDescription ?? '—'}</div>
                                <div className="col-span-1 flex justify-center">
                                    <span
                                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                                        style={{
                                            backgroundColor: entry.status === 'published' ? 'rgba(34,197,94,0.1)' : entry.status === 'archived' ? 'rgba(107,114,128,0.2)' : 'rgba(245,158,11,0.1)',
                                            color: entry.status === 'published' ? 'var(--success, #22c55e)' : entry.status === 'archived' ? 'var(--text-muted)' : 'var(--warning, #f59e0b)',
                                        }}
                                    >
                                        {entry.status ?? (entry.isPublished ? 'published' : 'draft')}
                                    </span>
                                </div>
                                <div className="col-span-2 flex justify-end gap-1.5 flex-wrap">
                                    {entry.status !== 'published' && (
                                        <motion.button
                                            whileHover={{ scale: 1.08 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handlePublish(entry._id)}
                                            disabled={publishingId === entry._id}
                                            className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                                            style={{ color: 'var(--success, #22c55e)' }}
                                            title="Publish"
                                        >
                                            <Send size={14} />
                                        </motion.button>
                                    )}
                                    <motion.button
                                        whileHover={{ scale: 1.08 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => openVersions(entry._id)}
                                        className="p-1.5 rounded-lg transition-colors"
                                        style={{ color: 'var(--text-muted)' }}
                                        title="Version history"
                                    >
                                        <History size={14} />
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.08 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => handleDuplicate(entry._id)}
                                        disabled={duplicatingId === entry._id}
                                        className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                                        style={{ color: 'var(--accent)' }}
                                        title="Duplicate"
                                    >
                                        <Copy size={14} />
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.08 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => openEdit(entry)}
                                        className="p-1.5 rounded-lg transition-colors"
                                        style={{ color: 'var(--accent)' }}
                                        title="Edit"
                                    >
                                        <Pencil size={14} />
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.08 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => requestDelete(entry._id)}
                                        disabled={deletingId === entry._id}
                                        className="p-1.5 rounded-lg transition-colors"
                                        style={{ color: 'var(--error, #ef4444)', opacity: deletingId === entry._id ? 0.5 : 1 }}
                                        title="Delete"
                                    >
                                        <Trash2 size={14} />
                                    </motion.button>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>

                {/* Pagination */}
                {!loading && pagination.totalPages > 1 && (
                    <div className="px-5 py-3 flex items-center justify-between border-t" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => fetchPages(pagination.page - 1)}
                                disabled={pagination.page <= 1}
                                className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                <ChevronLeft size={16} />
                            </button>
                            {Array.from({ length: Math.min(pagination.totalPages, 5) }).map((_, i) => {
                                const p = i + 1;
                                return (
                                    <button
                                        key={p}
                                        onClick={() => fetchPages(p)}
                                        className="w-7 h-7 rounded-lg text-xs font-semibold transition-colors"
                                        style={{
                                            backgroundColor: p === pagination.page ? 'var(--accent)' : 'transparent',
                                            color: p === pagination.page ? '#fff' : 'var(--text-muted)',
                                        }}
                                    >
                                        {p}
                                    </button>
                                );
                            })}
                            <button
                                onClick={() => fetchPages(pagination.page + 1)}
                                disabled={pagination.page >= pagination.totalPages}
                                className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* ── Modal ── */}
            <AnimatePresence>
                {modalOpen && (
                    <motion.div
                        key="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                        onClick={() => setModalOpen(false)}
                    >
                        <motion.div
                            key="modal-content"
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border p-6"
                            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-lg font-bold">{editingId ? 'Edit SEO Entry' : 'New SEO Entry'}</h2>
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => setModalOpen(false)}
                                    className="p-1.5 rounded-lg"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    <X size={18} />
                                </motion.button>
                            </div>

                            {formError && (
                                <div className="rounded-lg p-3 mb-4 flex items-center gap-2 text-sm" style={{ backgroundColor: 'var(--error-subtle, rgba(239,68,68,0.1))', color: 'var(--error, #ef4444)' }}>
                                    <AlertCircle size={14} /> {formError}
                                </div>
                            )}

                            <div className="space-y-4">
                                {/* Page Path */}
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Page URL path *</label>
                                    <input
                                        type="text"
                                        placeholder="/about"
                                        value={form.pagePath}
                                        onChange={(e) => setForm({ ...form, pagePath: e.target.value })}
                                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                                        style={inputStyle}
                                    />
                                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Use the page route only, for example <code>/about</code> or <code>/products/shoes</code>.
                                    </p>
                                </div>

                                {/* Google Preview */}
                                <div className="rounded-xl p-4 border" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}>
                                    <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Search Preview</p>
                                    <div className="space-y-1">
                                        <p className="text-lg text-blue-600 truncate" style={{ color: form.metaTitle ? '#1a0dab' : 'var(--text-muted)' }}>
                                            {form.metaTitle || 'Page title will appear here'}
                                        </p>
                                        <p className="text-sm" style={{ color: '#006621' }}>
                                            {typeof window !== 'undefined' ? `${window.location.origin}${form.pagePath || '/page-path'}` : 'https://example.com' + (form.pagePath || '')}
                                        </p>
                                        <p className="text-sm line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                                            {form.metaDescription || 'Meta description will appear here in search results.'}
                                        </p>
                                    </div>
                                </div>

                                {/* Meta Title & Description */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                                            Search result title <span className="font-normal">({form.metaTitle.length}/120)</span>
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Page Title – Brand"
                                            value={form.metaTitle}
                                            onChange={(e) => setForm({ ...form, metaTitle: e.target.value })}
                                            maxLength={120}
                                            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Search keywords (optional)</label>
                                        <input
                                            type="text"
                                            placeholder="keyword1, keyword2, …"
                                            value={form.keywords}
                                            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                                            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                                        Search result description <span className="font-normal">({form.metaDescription.length}/320)</span>
                                    </label>
                                    <textarea
                                        placeholder="A concise page description for search engines…"
                                        value={form.metaDescription}
                                        onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
                                        maxLength={320}
                                        rows={3}
                                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                                        style={inputStyle}
                                    />
                                </div>

                                {/* Open Graph */}
                                <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                                    <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Social sharing (optional)</p>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Social title</label>
                                            <input type="text" placeholder="Title shown when this page is shared" value={form.ogTitle} onChange={(e) => setForm({ ...form, ogTitle: e.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Social description</label>
                                        <textarea placeholder="Description shown when this page is shared" value={form.ogDescription} onChange={(e) => setForm({ ...form, ogDescription: e.target.value })} rows={2} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none" style={inputStyle} />
                                    </div>
                                    <div className="mt-4">
                                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Social image URL</label>
                                        <input type="text" placeholder="https://…" value={form.ogImage} onChange={(e) => setForm({ ...form, ogImage: e.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                    </div>
                                </div>

                                {/* Technical */}
                                <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                                    <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Advanced settings (optional)</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Preferred page URL</label>
                                            <input type="text" placeholder="https://…" value={form.canonicalUrl} onChange={(e) => setForm({ ...form, canonicalUrl: e.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                                Only fill this if this page has duplicate versions and you want search engines to prioritize one URL.
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Search engine access rules</label>
                                            <input type="text" placeholder="index, follow" value={form.robots} onChange={(e) => setForm({ ...form, robots: e.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Rich results code (JSON-LD)</label>
                                        <textarea
                                            placeholder='{"@context":"https://schema.org", …}'
                                            value={form.structuredData}
                                            onChange={(e) => setForm({ ...form, structuredData: e.target.value })}
                                            rows={4}
                                            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none font-mono"
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>

                                {/* Status (use Publish action to set published) */}
                                <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Workflow status</label>
                                    <select
                                        value={form.status}
                                        onChange={(e) => setForm({ ...form, status: e.target.value as PageStatus, isPublished: e.target.value === 'published' })}
                                        className="w-full max-w-xs px-3 py-2.5 rounded-xl text-sm outline-none"
                                        style={inputStyle}
                                    >
                                        {PAGE_STATUSES.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Use &quot;Publish&quot; button on the list to go live (requires permission).</p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                                <motion.button
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => setModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                                    style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg)' }}
                                >
                                    Cancel
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-shadow disabled:opacity-60"
                                    style={{
                                        background: 'linear-gradient(135deg, var(--accent), var(--accent-hover, var(--accent)))',
                                        boxShadow: '0 4px 14px rgba(74, 122, 155, 0.3)',
                                    }}
                                >
                                    <Check size={14} />
                                    {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Versions drawer */}
            <AnimatePresence>
                {versionsEntryId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                        onClick={() => setVersionsEntryId(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="w-full max-w-lg max-h-[80vh] overflow-hidden rounded-2xl border flex flex-col"
                            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                                <h3 className="font-bold flex items-center gap-2"><History size={18} style={{ color: 'var(--accent)' }} /> Version history</h3>
                                <button onClick={() => setVersionsEntryId(null)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
                            </div>
                            <div className="overflow-y-auto p-4 space-y-3">
                                {versions.length === 0 ? (
                                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No versions yet. Publish to create a version.</p>
                                ) : versions.map((v, i) => (
                                    <div key={i} className="rounded-xl p-3 border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}>
                                        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Version {v.versionNumber}</p>
                                        <p className="text-sm">{String(v.snapshot?.title ?? v.snapshot?.metaTitle ?? '—')}</p>
                                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{new Date((v as { createdAt?: string }).createdAt ?? 0).toLocaleString()}</p>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
