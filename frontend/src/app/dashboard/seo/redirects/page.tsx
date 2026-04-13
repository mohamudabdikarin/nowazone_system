'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowRight, Plus, Pencil, Trash2, X, Search,
    ChevronLeft, ChevronRight, Check, AlertCircle, Repeat,
} from 'lucide-react';
import api from '@/lib/api';
import { showConfirm } from '@/lib/sweetalert';

interface Redirect {
    _id: string;
    fromPath?: string;
    toPath?: string;
    sourcePath?: string;
    targetPath?: string;
    type?: number;
    redirectType?: number;
    isActive: boolean;
    hitCount?: number;
    lastHitAt: string | null;
    note?: string;
    notes?: string;
    updatedAt: string;
}

interface Pagination { page: number; limit: number; total: number; totalPages: number; }

const EMPTY_FORM = { fromPath: '', toPath: '', type: 301, isActive: true, note: '' as string };

export default function SeoRedirectsPage() {
    const [items, setItems] = useState<Redirect[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 15, total: 0, totalPages: 0 });
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchData = useCallback(async (page = 1) => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/seo/redirects', { params: { page, limit: pagination.limit, search, sort: '-updatedAt' } });
            setItems(res.data.data?.redirects || []);
            setPagination(res.data.data?.pagination || { page: 1, limit: 15, total: 0, totalPages: 0 });
        } catch { setError('Failed to load redirects'); }
        finally { setLoading(false); }
    }, [search, pagination.limit]);

    useEffect(() => {
        const t = setTimeout(() => fetchData(1), 300);
        return () => clearTimeout(t);
    }, [search, fetchData]);

    const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true); };
    const openEdit = (r: Redirect) => {
        setEditingId(r._id);
        setForm({
            fromPath: r.fromPath ?? r.sourcePath ?? '',
            toPath: r.toPath ?? r.targetPath ?? '',
            type: r.type ?? r.redirectType ?? 301,
            isActive: r.isActive,
            note: r.note ?? r.notes ?? '',
        });
        setFormError(null); setModalOpen(true);
    };

    const handleSave = async () => {
        const from = form.fromPath.trim();
        const to = form.toPath.trim();
        if (!from || !to) {
            setFormError('Both paths are required');
            return;
        }
        if (!from.startsWith('/') || !to.startsWith('/')) {
            setFormError('Paths must start with "/"');
            return;
        }
        if (from === to) {
            setFormError('Source and destination cannot be the same');
            return;
        }
        setSaving(true); setFormError(null);
        try {
            const payload = { ...form, fromPath: from, toPath: to };
            if (editingId) { await api.put(`/seo/redirects/${editingId}`, payload); }
            else { await api.post('/seo/redirects', payload); }
            setModalOpen(false); fetchData(pagination.page);
        } catch (err: unknown) {
            setFormError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save');
        } finally { setSaving(false); }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try { await api.delete(`/seo/redirects/${id}`); fetchData(pagination.page); }
        catch { setError('Failed to delete redirect'); }
        finally { setDeletingId(null); }
    };

    const requestDelete = async (id: string) => {
        const result = await showConfirm('Delete redirect?', 'This will permanently delete this redirect rule.');
        if (!result.isConfirmed) return;
        await handleDelete(id);
    };

    const inputStyle: React.CSSProperties = {
        backgroundColor: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', color: 'var(--text-primary)',
    };

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
                            <Repeat size={22} style={{ color: 'var(--accent)' }} />
                        </motion.div>
                        URL Redirects
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Manage 301 &amp; 302 URL redirects</p>
                </div>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white self-start"
                    style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover, var(--accent)))', boxShadow: '0 4px 14px rgba(74,122,155,0.3)' }}>
                    <Plus size={16} /> New Redirect
                </motion.button>
            </motion.div>

            {/* Search */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
                <div className="relative max-w-md">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input type="text" placeholder="Search redirects…" value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                </div>
            </motion.div>

            {error && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-4 mb-5 flex items-center gap-3"
                    style={{ backgroundColor: 'var(--error-subtle, rgba(239,68,68,0.1))', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--error, #ef4444)' }}>
                    <AlertCircle size={18} style={{ color: 'var(--error, #ef4444)' }} />
                    <p className="text-sm" style={{ color: 'var(--error, #ef4444)' }}>{error}</p>
                </motion.div>
            )}

            {/* Table */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="border rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>

                <div className="grid grid-cols-12 gap-3 px-5 py-3 text-xs font-semibold uppercase tracking-wider border-b"
                    style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}>
                    <div className="col-span-3">From</div>
                    <div className="col-span-3">To</div>
                    <div className="col-span-1 text-center">Type</div>
                    <div className="col-span-1 text-center">Status</div>
                    <div className="col-span-1 text-center">Hits</div>
                    <div className="col-span-1">Note</div>
                    <div className="col-span-2 text-right">Actions</div>
                </div>

                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {loading ? Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center">
                            {[3, 3, 1, 1, 1, 1, 2].map((span, j) => (
                                <div key={j} className={`col-span-${span}`}><div className="animate-pulse rounded w-full h-4" style={{ backgroundColor: 'var(--surface-muted)' }} /></div>
                            ))}
                        </div>
                    )) : items.length === 0 ? (
                        <div className="px-5 py-16 text-center">
                            <Repeat size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{search ? 'No results' : 'No redirects configured'}</p>
                            {!search && <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={openCreate}
                                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: 'var(--accent)' }}>
                                Create First Redirect</motion.button>}
                        </div>
                    ) : items.map((r, i) => (
                        <motion.div key={r._id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.18, delay: i * 0.02 }}
                            className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center transition-colors"
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg)')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                            <div className="col-span-3 text-sm font-medium truncate">{r.fromPath ?? r.sourcePath}</div>
                            <div className="col-span-3 text-sm truncate flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                                <ArrowRight size={12} className="flex-shrink-0" style={{ color: 'var(--accent)' }} /> {r.toPath ?? r.targetPath}
                            </div>
                            <div className="col-span-1 flex justify-center">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={{
                                        backgroundColor: (r.type ?? r.redirectType) === 301 ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
                                        color: (r.type ?? r.redirectType) === 301 ? 'var(--success, #22c55e)' : '#3b82f6'
                                    }}>
                                    {r.type ?? r.redirectType}
                                </span>
                            </div>
                            <div className="col-span-1 flex justify-center">
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{
                                        backgroundColor: r.isActive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                        color: r.isActive ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)'
                                    }}>
                                    {r.isActive ? 'Active' : 'Off'}
                                </span>
                            </div>
                            <div className="col-span-1 text-center text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{r.hitCount}</div>
                            <div className="col-span-1 text-xs truncate" style={{ color: 'var(--text-muted)' }}>{r.note ?? r.notes ?? '—'}</div>
                            <div className="col-span-2 flex justify-end gap-1.5">
                                <motion.button whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }} onClick={() => openEdit(r)}
                                    className="p-1.5 rounded-lg" style={{ color: 'var(--accent)' }} title="Edit"><Pencil size={14} /></motion.button>
                                <motion.button whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }}
                                    onClick={() => requestDelete(r._id)}
                                    disabled={deletingId === r._id}
                                    className="p-1.5 rounded-lg" style={{ color: 'var(--error, #ef4444)', opacity: deletingId === r._id ? 0.5 : 1 }} title="Delete">
                                    <Trash2 size={14} /></motion.button>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Pagination */}
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
                                <h2 className="text-lg font-bold">{editingId ? 'Edit Redirect' : 'New Redirect'}</h2>
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
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>From Path *</label>
                                    <input type="text" placeholder="/old-page" value={form.fromPath}
                                        onChange={(e) => setForm({ ...form, fromPath: e.target.value })}
                                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>To Path *</label>
                                    <input type="text" placeholder="/new-page" value={form.toPath}
                                        onChange={(e) => setForm({ ...form, toPath: e.target.value })}
                                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Redirect Type</label>
                                        <select value={form.type} onChange={(e) => setForm({ ...form, type: Number(e.target.value) })}
                                            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
                                            <option value={301}>301 – Permanent</option>
                                            <option value={302}>302 – Temporary</option>
                                        </select>
                                    </div>
                                    <div className="flex items-end gap-3 pb-1">
                                        <button type="button" onClick={() => setForm({ ...form, isActive: !form.isActive })}
                                            className="relative w-10 h-5 rounded-full transition-colors"
                                            style={{ backgroundColor: form.isActive ? 'var(--accent)' : 'var(--surface-muted)' }}>
                                            <motion.div animate={{ x: form.isActive ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                                className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow" />
                                        </button>
                                        <span className="text-sm font-medium">{form.isActive ? 'Active' : 'Inactive'}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Note</label>
                                    <input type="text" placeholder="Optional note" value={form.note}
                                        onChange={(e) => setForm({ ...form, note: e.target.value })}
                                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg)' }}>Cancel</motion.button>
                                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={saving}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                                    style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover, var(--accent)))', boxShadow: '0 4px 14px rgba(74,122,155,0.3)' }}>
                                    <Check size={14} /> {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
