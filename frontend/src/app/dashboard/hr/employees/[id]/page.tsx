'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Mail, Phone, Building2, Briefcase, Calendar,
  Pencil, Save, X, ClipboardList, FileText, UserCheck, UserX, Upload, Trash2, Loader2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { api } from '@/lib/api';
import { showConfirm } from '@/lib/sweetalert';

interface AttendanceRecord {
  _id: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: string;
  notes?: string;
}

interface Employee {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  jobTitle?: string;
  employeeId?: string;
  startDate?: string;
  status: 'active' | 'inactive' | 'on_leave';
  profileImage?: { url: string };
  documents?: { name: string; url: string; uploadedAt?: string }[];
}

const STATUS_MAP = {
  active:   { text: 'Active',   color: 'var(--success)', bg: 'var(--success-subtle)' },
  inactive: { text: 'Inactive', color: 'var(--error)',   bg: 'var(--error-subtle)' },
  on_leave: { text: 'On Leave', color: 'var(--warning)', bg: 'var(--warning-subtle)' },
};

const ATTENDANCE_COLOR: Record<string, string> = {
  present: 'var(--success)',
  absent: 'var(--error)',
  late: 'var(--warning)',
  leave: 'var(--info)',
};

const TABS = ['Info', 'Attendance', 'Documents'] as const;
type Tab = typeof TABS[number];

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(searchParams.get('edit') === 'true');
  const [tab, setTab] = useState<Tab>('Info');
  const [form, setForm] = useState<Partial<Employee>>({});
  const [saving, setSaving] = useState(false);
  const [docName, setDocName] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docDeleting, setDocDeleting] = useState<number | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [empRes, attRes] = await Promise.allSettled([
          api.get(`/hr/employees/${id}`),
          api.get(`/hr/attendance?employee=${id}&limit=30`),
        ]);
        if (empRes.status === 'fulfilled') {
          const emp = empRes.value.data.data?.employee || empRes.value.data.data;
          setEmployee(emp);
          setForm(emp);
        }
        if (attRes.status === 'fulfilled') {
          setAttendance(attRes.value.data.data?.records || attRes.value.data.data || []);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/hr/employees/${id}`, form);
      const { data } = await api.get(`/hr/employees/${id}`);
      const updated = data.data?.employee || data.data;
      setEmployee(updated);
      setEditing(false);
      toast.success('Employee updated');
    } catch {
      toast.error('Failed to update employee');
    } finally {
      setSaving(false);
    }
  };

  const uploadDocument = async () => {
    if (!docFile) { toast.error('Please select a document'); return; }
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append('document', docFile);
      if (docName.trim()) fd.append('name', docName.trim());
      const { data } = await api.post(`/hr/employees/${id}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const updated = data.data?.employee || data.data;
      setEmployee(updated);
      setDocName('');
      setDocFile(null);
      toast.success('Document uploaded');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Upload failed');
    } finally {
      setDocUploading(false);
    }
  };

  const deleteDocument = async (index: number) => {
    const result = await showConfirm('Delete document?', 'Delete this document?');
    if (!result.isConfirmed) return;
    setDocDeleting(index);
    try {
      const { data } = await api.delete(`/hr/employees/${id}/documents/${index}`);
      const updated = data.data?.employee || data.data;
      setEmployee(updated);
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete document');
    } finally {
      setDocDeleting(null);
    }
  };

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-64">
      <div
        className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
      />
    </div>
  );

  if (!employee) return (
    <div className="p-6 text-center">
      <p style={{ color: 'var(--text-muted)' }}>Employee not found.</p>
      <Link href="/dashboard/hr/employees" className="mt-3 inline-block text-sm font-medium hover:underline" style={{ color: 'var(--accent)' }}>
        Back to directory
      </Link>
    </div>
  );

  const initials = employee.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const statusInfo = STATUS_MAP[employee.status] || { text: employee.status, color: 'var(--text-muted)', bg: 'var(--surface-muted)' };

  const inputStyle = {
    backgroundColor: 'var(--surface-muted)',
    borderColor: 'var(--border)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/hr/employees"
          className="p-2 rounded-xl border transition-all hover:bg-[var(--surface-muted)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-bold flex-1" style={{ color: 'var(--text-primary)' }}>
          Employee Profile
        </h1>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border cursor-pointer transition-all hover:bg-[var(--surface-muted)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface)' }}
          >
            <Pencil size={14} /> Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => { setEditing(false); setForm(employee); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border cursor-pointer hover:bg-[var(--surface-muted)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface)' }}
            >
              <X size={14} /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl text-white cursor-pointer disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Profile card */}
      <div
        className="rounded-2xl border p-6 flex flex-col sm:flex-row items-start gap-6"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {/* Avatar */}
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden text-xl font-bold text-white"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-info))' }}
        >
          {employee.profileImage?.url
            ? <img src={employee.profileImage.url} alt={employee.name} className="w-full h-full object-cover" />
            : initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            {editing ? (
              <input
                type="text"
                value={form.name || ''}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="text-2xl font-bold bg-transparent border-b outline-none"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--accent)' }}
              />
            ) : (
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{employee.name}</h2>
            )}
            <span
              className="px-2.5 py-1 rounded-lg text-xs font-semibold"
              style={{ color: statusInfo.color, backgroundColor: statusInfo.bg }}
            >
              {statusInfo.text}
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {employee.jobTitle || 'No title'} {employee.department ? `· ${employee.department}` : ''}
          </p>
          <div className="flex flex-wrap gap-4 mt-3">
            {[
              { icon: <Mail size={13} />, value: employee.email },
              employee.phone && { icon: <Phone size={13} />, value: employee.phone },
              employee.employeeId && { icon: <UserCheck size={13} />, value: employee.employeeId },
              employee.startDate && { icon: <Calendar size={13} />, value: `Joined ${new Date(employee.startDate).toLocaleDateString()}` },
            ].filter(Boolean).map((item, i) => item && (
              <span key={i} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                {item.icon} {item.value}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-sm font-medium transition-all cursor-pointer border-b-2 -mb-px"
            style={{
              borderColor: tab === t ? 'var(--accent)' : 'transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Info' && (
        <div
          className="rounded-2xl border p-6 grid grid-cols-1 sm:grid-cols-2 gap-5"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {[
            { label: 'Email', key: 'email' as const, type: 'email', icon: <Mail size={13} /> },
            { label: 'Phone', key: 'phone' as const, type: 'tel', icon: <Phone size={13} /> },
            { label: 'Department', key: 'department' as const, type: 'text', icon: <Building2 size={13} /> },
            { label: 'Job Title', key: 'jobTitle' as const, type: 'text', icon: <Briefcase size={13} /> },
            { label: 'Employee ID', key: 'employeeId' as const, type: 'text', icon: <UserCheck size={13} /> },
            { label: 'Start Date', key: 'startDate' as const, type: 'date', icon: <Calendar size={13} /> },
          ].map(({ label, key, type, icon }) => (
            <div key={key}>
              <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                {icon} {label}
              </p>
              {editing ? (
                <input
                  type={type}
                  value={key === 'startDate' && form[key]
                    ? new Date(form[key] as string).toISOString().split('T')[0]
                    : (form[key] as string) || ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={inputStyle}
                />
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {key === 'startDate' && employee[key]
                    ? new Date(employee[key] as string).toLocaleDateString()
                    : (employee[key] as string) || <span style={{ color: 'var(--text-muted)' }}>Not set</span>}
                </p>
              )}
            </div>
          ))}

          {editing && (
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Status</p>
              <select
                value={form.status || 'active'}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Employee['status'] }))}
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none cursor-pointer"
                style={inputStyle}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>
          )}
        </div>
      )}

      {tab === 'Attendance' && (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {attendance.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <ClipboardList size={32} style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No attendance records</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-muted)' }}>
                  {['Date', 'Check In', 'Check Out', 'Status', 'Notes'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendance.map((rec) => (
                  <tr key={rec._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                      {new Date(rec.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {rec.checkIn || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {rec.checkOut || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize"
                        style={{ color: ATTENDANCE_COLOR[rec.status] ?? 'var(--text-muted)', backgroundColor: `${ATTENDANCE_COLOR[rec.status] ?? 'var(--text-muted)'}1a` }}
                      >
                        {rec.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                      {rec.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'Documents' && (
        <div
          className="rounded-2xl border p-6"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {/* Upload */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="flex-1">
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Document name (optional)
              </label>
              <input
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="e.g. Offer Letter, ID Proof…"
                className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none"
                style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex items-end gap-2">
              <label
                className="px-4 py-2.5 text-sm font-medium rounded-xl border cursor-pointer hover:bg-[var(--surface-muted)] transition-all"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                />
                <span className="inline-flex items-center gap-2">
                  <Upload size={14} /> {docFile ? 'Change file' : 'Choose file'}
                </span>
              </label>
              <button
                onClick={uploadDocument}
                disabled={!docFile || docUploading}
                className="px-4 py-2.5 text-sm font-semibold rounded-xl text-white disabled:opacity-50 cursor-pointer hover:opacity-90 transition-all"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {docUploading ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Uploading…</span> : 'Upload'}
              </button>
            </div>
          </div>

          {/* List */}
          {!employee.documents?.length ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <FileText size={32} style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No documents uploaded</p>
            </div>
          ) : (
            <div className="space-y-2">
              {employee.documents.map((doc, i) => (
                <div
                  key={`${doc.url}-${i}`}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:bg-[var(--surface-muted)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <FileText size={16} style={{ color: 'var(--accent)' }} />
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 min-w-0"
                  >
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{doc.name}</p>
                    {doc.uploadedAt && (
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                      </p>
                    )}
                  </a>
                  <button
                    onClick={() => deleteDocument(i)}
                    disabled={docDeleting === i}
                    className="p-2 rounded-xl border cursor-pointer transition-all disabled:opacity-50 hover:bg-[var(--error-subtle)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    title="Delete document"
                  >
                    {docDeleting === i ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
