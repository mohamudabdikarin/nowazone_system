'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Search, FileText, X, Download, Sparkles,
  User, Mail, Phone, Clock, Tag, CheckCircle, AlertCircle,
  Loader2, Filter, Briefcase, Trash2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { api } from '@/lib/api';
import { showConfirm } from '@/lib/sweetalert';

interface Resume {
  _id: string;
  applicantName: string;
  email: string;
  phone?: string;
  jobId?: { _id: string; title: string };
  fileUrl?: string;
  skills: string[];
  experience?: string;
  education?: string;
  parsedData?: Record<string, unknown>;
  applicationStatus: string;
  createdAt: string;
}

interface JobOption { _id: string; title: string }

const STATUS_COLORS: Record<string, string> = {
  new:       'var(--info)',
  interview: 'var(--warning)',
  selected:  'var(--success)',
  rejected:  'var(--error)',
};

export default function ResumeDatabasePage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobFilter, setJobFilter] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<Resume | null>(null);
  const [parsing, setParsing] = useState<string | null>(null);

  // Upload form state
  const [uploadFile, setUploadFile]   = useState<File | null>(null);
  const [uploadName, setUploadName]   = useState('');
  const [uploadEmail, setUploadEmail] = useState('');
  const [uploadPhone, setUploadPhone] = useState('');
  const [uploadJob, setUploadJob]     = useState('');
  const [uploading, setUploading]     = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchResumes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (skillFilter) params.set('skill', skillFilter);
      if (jobFilter) params.set('jobId', jobFilter);
      const { data } = await api.get(`/hr/resumes?${params.toString()}`);
      setResumes(data.data?.resumes || data.data || []);
    } catch {
      setResumes([]);
    } finally {
      setLoading(false);
    }
  }, [search, skillFilter, jobFilter]);

  useEffect(() => { fetchResumes(); }, [fetchResumes]);

  useEffect(() => {
    api.get('/hr/jobs?status=active').then(({ data }) => {
      setJobs(data.data?.jobs || data.data || []);
    }).catch(() => {});
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) { toast.error('Please select a PDF file'); return; }
    if (!uploadName.trim()) { toast.error('Applicant name is required'); return; }
    if (!uploadEmail.trim()) { toast.error('Email is required'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('resume', uploadFile);
      formData.append('applicantName', uploadName);
      formData.append('email', uploadEmail);
      if (uploadPhone) formData.append('phone', uploadPhone);
      if (uploadJob)   formData.append('jobId', uploadJob);
      const { data } = await api.post('/hr/resumes', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Resume uploaded!');
      setUploadOpen(false);
      setUploadFile(null);
      setUploadName('');
      setUploadEmail('');
      setUploadPhone('');
      setUploadJob('');
      fetchResumes();
      // Trigger AI parse if not already done
      if (data.data?.resume?._id) {
        triggerAIParse(data.data.resume._id);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const deleteResume = async (id: string, name: string) => {
    const result = await showConfirm('Delete resume?', `Delete resume for "${name}"? This cannot be undone.`);
    if (!result.isConfirmed) return;
    setDeletingId(id);
    try {
      await api.delete(`/hr/resumes/${id}`);
      toast.success('Resume deleted');
      setResumes((prev) => prev.filter((r) => r._id !== id));
      if (selected?._id === id) setSelected(null);
    } catch {
      toast.error('Failed to delete resume');
    } finally {
      setDeletingId(null);
    }
  };

  const triggerAIParse = async (id: string) => {
    setParsing(id);
    try {
      const { data } = await api.post(`/hr/resumes/${id}/parse`);
      const method = (data?.data?.parsed?._meta as { method?: string } | undefined)?.method;
      if (method === 'openai') toast.success('AI parsed resume successfully');
      else if (method === 'basic') toast.info('Parsed (basic). Set OPENAI_API_KEY to enable AI parsing.');
      else toast.success('Resume parsed');
      fetchResumes();
    } catch {
      toast.error('AI parsing failed');
    } finally {
      setParsing(null);
    }
  };

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Phone', 'Job', 'Skills', 'Experience', 'Status', 'Uploaded'];
    const rows = resumes.map((r) => [
      r.applicantName, r.email, r.phone || '',
      r.jobId?.title || '',
      (r.skills || []).join('; '),
      r.experience || '',
      r.applicationStatus,
      new Date(r.createdAt).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'resumes.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const allSkills = Array.from(new Set(resumes.flatMap((r) => r.skills || []))).sort();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Resume Database</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Upload resumes · AI-powered skill extraction · Searchable database
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border cursor-pointer hover:bg-[var(--surface-muted)] transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface)' }}
          >
            <Download size={14} /> Export
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl text-white hover:opacity-90 transition-all cursor-pointer"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Upload size={14} /> Upload Resume
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by name, email, skill…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border outline-none"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <select
          value={skillFilter}
          onChange={(e) => setSkillFilter(e.target.value)}
          className="px-3 py-2.5 text-sm rounded-xl border outline-none cursor-pointer"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="">All Skills</option>
          {allSkills.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={jobFilter}
          onChange={(e) => setJobFilter(e.target.value)}
          className="px-3 py-2.5 text-sm rounded-xl border outline-none cursor-pointer"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="">All Jobs</option>
          {jobs.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
        </select>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-muted)' }}>
                {['Applicant', 'Job', 'Skills', 'Experience', 'Status', 'Uploaded', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-muted)' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : resumes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <FileText size={32} style={{ color: 'var(--text-muted)' }} />
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No resumes yet</p>
                      <button
                        onClick={() => setUploadOpen(true)}
                        className="text-sm font-semibold hover:underline cursor-pointer"
                        style={{ color: 'var(--accent)' }}
                      >
                        Upload the first resume
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                resumes.map((resume) => (
                  <tr
                    key={resume._id}
                    className="hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onClick={() => setSelected(resume)}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{resume.applicantName}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{resume.email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {resume.jobId?.title || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(resume.skills || []).slice(0, 3).map((s) => (
                          <span
                            key={s}
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-text)' }}
                          >
                            {s}
                          </span>
                        ))}
                        {resume.skills?.length > 3 && (
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>+{resume.skills.length - 3}</span>
                        )}
                        {!resume.skills?.length && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm max-w-[150px] truncate" style={{ color: 'var(--text-secondary)' }}>
                      {resume.experience || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize"
                        style={{ color: STATUS_COLORS[resume.applicationStatus] ?? 'var(--text-muted)', backgroundColor: `${STATUS_COLORS[resume.applicationStatus] ?? 'var(--text-muted)'}1a` }}
                      >
                        {resume.applicationStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                      {new Date(resume.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {resume.fileUrl && (
                          <a
                            href={resume.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg hover:bg-[var(--accent-subtle)] transition-colors"
                            title="View PDF"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <FileText size={13} />
                          </a>
                        )}
                        <button
                          onClick={() => triggerAIParse(resume._id)}
                          disabled={parsing === resume._id}
                          className="p-1.5 rounded-lg hover:bg-[var(--accent-subtle)] transition-colors cursor-pointer disabled:opacity-50"
                          title="Re-parse with AI"
                          style={{ color: parsing === resume._id ? 'var(--accent)' : 'var(--text-muted)' }}
                        >
                          {parsing === resume._id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Sparkles size={13} />}
                        </button>
                        <button
                          onClick={() => deleteResume(resume._id, resume.applicantName)}
                          disabled={deletingId === resume._id}
                          className="p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 hover:bg-[var(--error-subtle)]"
                          title="Delete resume"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {deletingId === resume._id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {uploadOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setUploadOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50 rounded-2xl shadow-2xl p-6"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Upload Resume</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>PDF · max 10 MB · AI will extract skills automatically</p>
                </div>
                <button onClick={() => setUploadOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-muted)] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleUpload} className="space-y-4">
                {/* File drop zone */}
                <div
                  className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all hover:border-[var(--accent)]"
                  style={{ borderColor: uploadFile ? 'var(--accent)' : 'var(--border)', backgroundColor: 'var(--surface-muted)' }}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploadFile ? (
                    <div className="flex items-center gap-2 justify-center">
                      <CheckCircle size={18} style={{ color: 'var(--success)' }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{uploadFile.name}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}
                        className="cursor-pointer"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Click to select PDF</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>AI will parse skills, experience &amp; education</p>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Applicant Name <span style={{ color: 'var(--error)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      placeholder="Full name"
                      className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Email <span style={{ color: 'var(--error)' }}>*</span>
                    </label>
                    <input
                      type="email"
                      value={uploadEmail}
                      onChange={(e) => setUploadEmail(e.target.value)}
                      placeholder="applicant@email.com"
                      className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Phone (optional)
                    </label>
                    <input
                      type="tel"
                      value={uploadPhone}
                      onChange={(e) => setUploadPhone(e.target.value)}
                      placeholder="+1 555 0100"
                      className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Applying for (optional)
                    </label>
                    <select
                      value={uploadJob}
                      onChange={(e) => setUploadJob(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none cursor-pointer"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      <option value="">No specific job</option>
                      {jobs.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setUploadOpen(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border cursor-pointer hover:bg-[var(--surface-muted)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl text-white cursor-pointer disabled:opacity-50 hover:opacity-90"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {uploading ? 'Uploading…' : 'Upload & Parse'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-40"
              onClick={() => setSelected(null)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md z-50 overflow-y-auto shadow-2xl"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              <div className="p-6 space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{selected.applicantName}</h2>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{selected.email}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-[var(--surface-muted)] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                    <X size={16} />
                  </button>
                </div>

                {selected.jobId && (
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <Briefcase size={13} style={{ color: 'var(--text-muted)' }} /> {selected.jobId.title}
                  </div>
                )}

                {selected.skills?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>AI-Extracted Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.skills.map((s) => (
                        <span key={s} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                          <Sparkles size={9} /> {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.experience && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Experience</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selected.experience}</p>
                  </div>
                )}

                {selected.education && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Education</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selected.education}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {selected.fileUrl && (
                    <a
                      href={selected.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border hover:bg-[var(--surface-muted)] transition-all"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      <FileText size={14} style={{ color: 'var(--accent)' }} /> View PDF
                    </a>
                  )}
                  <button
                    onClick={() => triggerAIParse(selected._id)}
                    disabled={parsing === selected._id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl text-white cursor-pointer disabled:opacity-50 hover:opacity-90"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {parsing === selected._id
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Sparkles size={14} />}
                    {parsing === selected._id ? 'Parsing…' : 'Re-parse AI'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
