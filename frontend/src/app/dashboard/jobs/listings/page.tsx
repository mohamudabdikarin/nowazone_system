'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Briefcase, Plus, Search, MapPin, Clock, ChevronRight, Trash2, ToggleLeft, ToggleRight, Pencil } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { showConfirm } from '@/lib/sweetalert';

interface Job {
  _id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  experience: string;
  description?: string;
  skills?: string[];
  status: string;
  applicationCount: number;
  createdAt: string;
  applicationDeadline?: string;
}

const TYPE_COLORS: Record<string, string> = {
  full_time: 'text-green-400 bg-green-400/10',
  part_time: 'text-yellow-400 bg-yellow-400/10',
  contract:  'text-orange-400 bg-orange-400/10',
  remote:    'text-blue-500 bg-blue-500/10',
  hybrid:    'text-purple-400 bg-purple-400/10',
  onsite:    'text-blue-400 bg-blue-400/10',
};
const STATS_CLASSES: Record<string, string> = {
  orange: 'text-orange-400',
  green: 'text-green-400',
  cyan: 'text-cyan-400',
  purple: 'text-purple-400',
};
const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-400 bg-green-400/10',
  paused: 'text-yellow-400 bg-yellow-400/10',
  closed: 'text-red-400 bg-red-400/10',
  draft:  'text-gray-400 bg-gray-400/10',
};

const EMPTY_FORM = { title: '', department: '', location: '', type: 'full_time', experience: 'mid', description: '', skills: '' };
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 280, damping: 24 },
  },
};

export default function JobListingsPage() {
  const [jobs, setJobs]           = useState<Job[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [stats, setStats]         = useState({ totalJobs: 0, activeJobs: 0, totalApplications: 0, recentApplications: 0 });

  const fetchAll = useCallback(async () => {
    try {
      const [jobsRes, statsRes] = await Promise.all([
        api.get('/jobs?limit=50'),
        api.get('/jobs/stats'),
      ]);
      setJobs(jobsRes.data.data.jobs || []);
      setStats(statsRes.data.data);
    } catch { toast.error('Failed to load jobs'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreateModal = () => {
    setEditingJobId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = async (job: Job) => {
    setEditingJobId(job._id);
    try {
      const { data } = await api.get(`/jobs/${job._id}`);
      const j = data?.data?.job;
      if (j) {
        setForm({
          title: j.title || '',
          department: j.department || '',
          location: j.location || '',
          type: j.type || 'full_time',
          experience: j.experience || 'mid',
          description: j.description || '',
          skills: Array.isArray(j.skills) ? j.skills.join(', ') : (j.skills || ''),
        });
        setShowModal(true);
      }
    } catch {
      toast.error('Failed to load job details');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, skills: form.skills.split(',').map(s => s.trim()).filter(Boolean) };
    try {
      if (editingJobId) {
        await api.patch(`/jobs/${editingJobId}`, payload);
        toast.success('Job updated!');
      } else {
        await api.post('/jobs', payload);
        toast.success('Job created!');
      }
      setShowModal(false);
      setEditingJobId(null);
      setForm(EMPTY_FORM);
      fetchAll();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (job: Job) => {
    const newStatus = job.status === 'active' ? 'paused' : 'active';
    try {
      await api.patch(`/jobs/${job._id}`, { status: newStatus });
      setJobs(prev => prev.map(j => j._id === job._id ? { ...j, status: newStatus } : j));
      toast.success(`Job ${newStatus}`);
    } catch { toast.error('Failed to update'); }
  };

  const deleteJob = async (id: string) => {
    const result = await showConfirm('Delete job?', 'Delete this job and all applications?');
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/jobs/${id}`);
      setJobs(prev => prev.filter(j => j._id !== id));
      toast.success('Job deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const filtered = jobs.filter(j =>
    (j.title.toLowerCase().includes(search.toLowerCase()) || j.department.toLowerCase().includes(search.toLowerCase())) &&
    (!statusFilter || j.status === statusFilter)
  );

  if (loading) return (
    <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 border-4 border-t-transparent rounded-full"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="p-6 min-h-screen"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text-primary)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring' as const, stiffness: 260, damping: 24 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <motion.div
              className="p-2 bg-orange-400/10 rounded-xl"
              whileHover={{ rotate: [0, -8, 8, 0], scale: 1.08 }}
              transition={{ duration: 0.4 }}
            >
              <Briefcase size={22} className="text-orange-400" />
            </motion.div>
            Job Listings
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Manage open positions and recruitment pipeline</p>
        </div>
        <motion.button onClick={openCreateModal}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors text-white cursor-pointer"
          style={{ backgroundColor: 'var(--accent)' }}>
          <Plus size={16} /> Post Job
        </motion.button>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
      >
        {[
          { label: 'Total Jobs', value: stats.totalJobs, color: 'orange' },
          { label: 'Active', value: stats.activeJobs, color: 'green' },
          { label: 'Total Applications', value: stats.totalApplications, color: 'cyan' },
          { label: 'Applications Today', value: stats.recentApplications, color: 'purple' },
        ].map(s => (
          <motion.div key={s.label}
            whileHover={{ scale: 1.03, y: -3, transition: { type: 'spring' as const, stiffness: 400, damping: 18 } }}
            whileTap={{ scale: 0.98 }}
            className="border rounded-xl p-4 transition-shadow cursor-pointer"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            <p className={`text-3xl font-bold ${STATS_CLASSES[s.color]}`}>{s.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="flex gap-3 mb-6"
      >
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs…"
            className="w-full pl-10 pr-4 py-3 border rounded-xl text-sm placeholder-gray-500 focus:outline-none"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          className="px-4 py-3 border rounded-xl text-sm focus:outline-none min-w-[130px]"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Statuses</option>
          {['active','paused','closed','draft'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </motion.div>

      {/* Job Cards */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
        {filtered.map(job => (
          <motion.div key={job._id} variants={fadeUp}
            whileHover={{ scale: 1.01, x: 4, transition: { type: 'spring' as const, stiffness: 400, damping: 20 } }}
            whileTap={{ scale: 0.995 }}
            className="border rounded-xl p-5 flex items-center gap-4 transition-shadow cursor-pointer"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="w-11 h-11 rounded-xl bg-orange-400/10 border border-orange-400/20 flex items-center justify-center flex-shrink-0">
              <Briefcase size={18} className="text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold truncate">{job.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status]}`}>{job.status}</span>
              </div>
              <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[job.type]}`}>{job.type.replace(/_/g,' ')}</span>
                <span className="capitalize">{job.experience}</span>
                <span>{job.department}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{job.applicationCount}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>applications</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <motion.button
                onClick={() => openEditModal(job)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                className="p-2 rounded-lg transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--text-muted)' }}
                title="Edit job"
              >
                <Pencil size={16} />
              </motion.button>
              <motion.button
                onClick={() => toggleStatus(job)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                className="p-2 rounded-lg transition-colors cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
                title="Toggle status"
              >
                {job.status === 'active' ? <ToggleRight size={20} className="text-green-400" /> : <ToggleLeft size={20} />}
              </motion.button>
              <motion.button
                onClick={() => deleteJob(job._id)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                className="p-2 rounded-lg transition-colors cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <Trash2 size={15} />
              </motion.button>
            </div>
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
            <Briefcase size={40} className="mx-auto mb-3 opacity-20" />
            <p>No job listings found. Post your first job!</p>
          </div>
        )}
      </motion.div>

      {/* Create Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
          >
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
              onClick={(e) => e.stopPropagation()}
            >
            <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
              <Briefcase size={20} className="text-orange-400" /> {editingJobId ? 'Edit Job' : 'Post New Job'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { label: 'Job Title', key: 'title', placeholder: 'e.g. Senior Frontend Developer' },
                { label: 'Department', key: 'department', placeholder: 'e.g. Engineering' },
                { label: 'Location', key: 'location', placeholder: 'e.g. Bangalore, India' },
                { label: 'Required Skills (comma-separated)', key: 'skills', placeholder: 'React, TypeScript, Node.js' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
                  <input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder} required={f.key !== 'skills'}
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Job Type</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                    {['full_time','part_time','contract','remote','hybrid','onsite'].map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Experience</label>
                  <select value={form.experience} onChange={e => setForm(p => ({ ...p, experience: e.target.value }))}
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none"
                    style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                    {['entry','mid','senior','lead','executive'].map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Job Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={4} required placeholder="Describe the role, responsibilities, and requirements…"
                  className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none resize-none"
                  style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div className="flex gap-3 pt-2">
                <motion.button type="button" onClick={() => { setShowModal(false); setEditingJobId(null); setForm(EMPTY_FORM); }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-2.5 border rounded-xl text-sm transition-colors cursor-pointer"
                  style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  Cancel
                </motion.button>
                <motion.button type="submit" disabled={saving}
                  whileHover={{ scale: saving ? 1 : 1.02 }}
                  whileTap={{ scale: saving ? 1 : 0.98 }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 text-white cursor-pointer"
                  style={{ backgroundColor: 'var(--accent)' }}>
                  {saving ? (editingJobId ? 'Saving…' : 'Posting…') : (editingJobId ? 'Save Changes' : 'Post Job')}
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
