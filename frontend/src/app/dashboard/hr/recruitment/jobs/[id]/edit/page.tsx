'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Briefcase, MapPin, Clock, FileText, Globe, Loader2 } from 'lucide-react';
import { JobDescriptionEditor } from '@/components/JobDescriptionEditor';
import { toast } from 'react-toastify';
import { api } from '@/lib/api';

interface FormState {
  title: string;
  department: string;
  location: string;
  type: string;
  experience: string;
  status: string;
  positions: number;
  description: string;
}

const DEPARTMENTS = [
  'Engineering', 'Product', 'Design', 'Marketing', 'Sales',
  'HR', 'Finance', 'Operations', 'Customer Success', 'Legal',
];

const EXPERIENCE_LEVELS = ['entry', 'mid', 'senior', 'lead', 'executive'];

export default function EditJobPage() {
  const router  = useRouter();
  const params  = useParams();
  const jobId   = params.id as string;

  const [form, setForm]           = useState<FormState | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]       = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    api.get(`/jobs/${jobId}`)
      .then(({ data }) => {
        const job = data.data?.job || data.data;
        setForm({
          title:       job.title       || '',
          department:  job.department  || '',
          location:    job.location   || '',
          type:        job.type        || 'full_time',
          experience:  job.experience  || 'mid',
          status:      job.status      || 'draft',
          positions:   Math.max(1, job.positions ?? 1),
          description: job.description || '',
        });
      })
      .catch(() => { toast.error('Failed to load job'); router.push('/dashboard/hr/recruitment/jobs'); })
      .finally(() => setLoadingJob(false));
  }, [jobId, router]);

  const handleChange = (field: keyof FormState, value: string | number) => {
    setForm((prev) => prev ? { ...prev, [field]: value } : prev);
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form?.title.trim())       errs.title       = 'Title is required';
    if (!form?.description.trim()) errs.description = 'Description is required';
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSubmitting(true);
    try {
      await api.patch(`/jobs/${jobId}`, { ...form, positions: Math.max(1, form.positions ?? 1) });
      toast.success('Job updated successfully');
      router.push('/dashboard/hr/recruitment/jobs');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to update job');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = (hasError?: string) => ({
    backgroundColor: 'var(--surface)',
    borderColor: hasError ? 'var(--error)' : 'var(--border)',
    color: 'var(--text-primary)',
  });

  if (loadingJob) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  if (!form) return null;

  return (
    <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/hr/recruitment/jobs"
          className="p-2 rounded-xl border transition-all hover:bg-[var(--surface-muted)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Edit Job Posting</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Update job details and status</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div
          className="rounded-2xl border p-6 space-y-5"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Job Details
          </p>

          {/* Job title — full width */}
          <div>
            <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Briefcase size={13} style={{ color: 'var(--text-muted)' }} />
              Job Title <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="e.g. Senior Frontend Engineer"
              className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none"
              style={inputStyle(errors.title)}
            />
            {errors.title && <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>{errors.title}</p>}
          </div>

          {/* Grid fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Department
              </label>
              <select
                value={form.department}
                onChange={(e) => handleChange('department', e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none cursor-pointer"
                style={inputStyle()}
              >
                <option value="">Select department</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <MapPin size={13} style={{ color: 'var(--text-muted)' }} /> Location
              </label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => handleChange('location', e.target.value)}
                placeholder="e.g. New York, NY"
                className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none"
                style={inputStyle()}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Globe size={13} style={{ color: 'var(--text-muted)' }} /> Work Type
              </label>
              <select
                value={form.type}
                onChange={(e) => handleChange('type', e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none cursor-pointer"
                style={inputStyle()}
              >
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Clock size={13} style={{ color: 'var(--text-muted)' }} /> Experience Level
              </label>
              <select
                value={form.experience}
                onChange={(e) => handleChange('experience', e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none cursor-pointer"
                style={inputStyle()}
              >
                {EXPERIENCE_LEVELS.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Number of positions
              </label>
              <input
                type="number"
                min={1}
                value={form.positions}
                onChange={(e) => handleChange('positions', parseInt(e.target.value, 10) || 1)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none"
                style={inputStyle()}
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Status
            </label>
            <div className="flex flex-wrap gap-3">
              {(['draft', 'active', 'paused', 'closed'] as const).map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-xl border text-sm font-medium transition-all capitalize"
                  style={{
                    borderColor:     form.status === s ? 'var(--accent)' : 'var(--border)',
                    backgroundColor: form.status === s ? 'var(--accent-subtle)' : 'transparent',
                    color:           form.status === s ? 'var(--accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  <input
                    type="radio"
                    name="status"
                    value={s}
                    checked={form.status === s}
                    onChange={() => handleChange('status', s)}
                    className="hidden"
                  />
                  {s === 'draft' ? 'Draft' : s === 'active' ? 'Active / Published' : s === 'paused' ? 'Paused' : 'Closed'}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Description */}
        <div
          className="rounded-2xl border p-6 space-y-3"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <label className="block text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <FileText size={13} style={{ color: 'var(--text-muted)' }} />
            Job Description <span style={{ color: 'var(--error)' }}>*</span>
          </label>
          <JobDescriptionEditor
            value={form.description}
            onChange={(v) => handleChange('description', v)}
            rows={10}
            error={errors.description}
            inputStyle={inputStyle(errors.description)}
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/dashboard/hr/recruitment/jobs"
            className="px-4 py-2.5 text-sm font-medium rounded-xl border transition-all hover:bg-[var(--surface-muted)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface)' }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl text-white transition-all disabled:opacity-50 cursor-pointer hover:opacity-90"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {submitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
