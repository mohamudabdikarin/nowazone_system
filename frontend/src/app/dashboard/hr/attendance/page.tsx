'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, Search, ChevronLeft, ChevronRight,
  UserCheck, UserX, Clock, Coffee, Download,
  Trash2, Edit2, Check, X, BarChart3, ClipboardList, CheckSquare, RefreshCw,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { api } from '@/lib/api';
import { showConfirm } from '@/lib/sweetalert';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  _id: string;
  name: string;
  department?: string;
  jobTitle?: string;
  profileImage?: { url: string };
}

interface AttendanceRecord {
  _id: string;
  employee: Employee | null;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: 'present' | 'absent' | 'late' | 'leave';
  notes?: string;
}

interface DailyEntry {
  employee: Employee;
  record: AttendanceRecord | null;
}

interface EmployeeStat {
  employee: { _id: string; name: string; department?: string };
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  present: { label: 'Present',  color: 'var(--success)', bg: 'var(--success-subtle)', icon: <UserCheck size={13} /> },
  absent:  { label: 'Absent',   color: 'var(--error)',   bg: 'var(--error-subtle)',   icon: <UserX size={13} /> },
  late:    { label: 'Late',     color: 'var(--warning)', bg: 'var(--warning-subtle)', icon: <Clock size={13} /> },
  leave:   { label: 'On Leave', color: 'var(--info)',    bg: 'var(--info-subtle)',    icon: <Coffee size={13} /> },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validateTime(t: string): boolean {
  return !t || TIME_RE.test(t);
}

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function workingHours(ci?: string, co?: string): string {
  if (!ci || !co) return '—';
  const mins = timeToMins(co) - timeToMins(ci);
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthBounds(date: Date) {
  const y = date.getFullYear(), mo = date.getMonth();
  return {
    start: new Date(y, mo, 1).toISOString().split('T')[0],
    end:   new Date(y, mo + 1, 0).toISOString().split('T')[0],
  };
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function apiErrMsg(err: unknown): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Something went wrong';
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Avatar({ emp }: { emp: Employee | null }) {
  if (!emp) return null;
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-info))' }}
    >
      {emp.profileImage?.url
        ? <img src={emp.profileImage.url} alt="" className="w-full h-full object-cover" />
        : initials(emp.name)}
    </div>
  );
}

function StatusBadge({ status }: { status: AttendanceRecord['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap"
      style={{ color: cfg.color, backgroundColor: cfg.bg }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}

function TimeInput({
  value, onChange, error, disabled,
}: { value: string; onChange: (v: string) => void; error?: string; disabled?: boolean }) {
  return (
    <div>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="px-2 py-1.5 text-xs rounded-lg border outline-none w-[100px] transition-colors disabled:opacity-50"
        style={{
          backgroundColor: 'var(--surface-muted)',
          borderColor: error ? 'var(--error)' : 'var(--border)',
          color: 'var(--text-primary)',
        }}
      />
      {error && <p className="text-[10px] mt-0.5 font-medium" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  );
}

function MonthNav({ date, onChange }: { date: Date; onChange: (d: Date) => void }) {
  const label = date.toLocaleString('default', { month: 'long', year: 'numeric' });
  return (
    <div
      className="flex items-center gap-2 rounded-xl border px-3 py-2 w-fit"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <button
        onClick={() => onChange(new Date(date.getFullYear(), date.getMonth() - 1, 1))}
        className="p-1 rounded-lg cursor-pointer hover:bg-[var(--surface-muted)] transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-sm font-medium min-w-[150px] text-center" style={{ color: 'var(--text-primary)' }}>
        {label}
      </span>
      <button
        onClick={() => onChange(new Date(date.getFullYear(), date.getMonth() + 1, 1))}
        className="p-1 rounded-lg cursor-pointer hover:bg-[var(--surface-muted)] transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

function StatCards({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {(Object.entries(STATUS_CONFIG) as [AttendanceRecord['status'], typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]][]).map(([k, cfg]) => (
        <div
          key={k}
          className="rounded-xl border p-3 flex items-center gap-2.5"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
            {cfg.icon}
          </div>
          <div>
            <p className="text-xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{counts[k] ?? 0}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{cfg.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── DAILY MARK TAB ───────────────────────────────────────────────────────────

interface MarkEntry {
  status: AttendanceRecord['status'];
  checkIn: string;
  checkOut: string;
  notes: string;
  existingId?: string;
  dirty: boolean;
  errors: { checkIn?: string; checkOut?: string };
}

function validateMarkEntry(ci: string, co: string): { checkIn?: string; checkOut?: string } {
  const errs: { checkIn?: string; checkOut?: string } = {};
  if (ci && !validateTime(ci))  errs.checkIn  = 'Use HH:MM (e.g. 09:00)';
  if (co && !validateTime(co))  errs.checkOut = 'Use HH:MM (e.g. 18:00)';
  if (ci && co && validateTime(ci) && validateTime(co) && timeToMins(co) <= timeToMins(ci)) {
    errs.checkOut = 'Must be after check-in';
  }
  return errs;
}

function DailyMarkTab() {
  const [date, setDate]           = useState(todayISO());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries]     = useState<Record<string, MarkEntry>>({});
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');

  const loadDay = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/hr/attendance/daily?date=${d}`);
      const daily: DailyEntry[] = data.data?.daily || [];
      setEmployees(daily.map((de) => de.employee));
      const map: Record<string, MarkEntry> = {};
      daily.forEach(({ employee, record }) => {
        map[employee._id] = {
          status:     record?.status   ?? 'present',
          checkIn:    record?.checkIn  ?? '',
          checkOut:   record?.checkOut ?? '',
          notes:      record?.notes    ?? '',
          existingId: record?._id,
          dirty:      false,
          errors:     {},
        };
      });
      setEntries(map);
    } catch {
      toast.error('Failed to load daily attendance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDay(date); }, [date, loadDay]);

  const updateEntry = (empId: string, patch: Partial<MarkEntry>) => {
    setEntries((prev) => {
      const cur = prev[empId];
      const next = { ...cur, ...patch, dirty: true };
      const ci = 'checkIn'  in patch ? patch.checkIn!  : cur.checkIn;
      const co = 'checkOut' in patch ? patch.checkOut! : cur.checkOut;
      return { ...prev, [empId]: { ...next, errors: validateMarkEntry(ci, co) } };
    });
  };

  const markAll = (status: AttendanceRecord['status']) => {
    setEntries((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        next[id] = { ...next[id], status, dirty: true, errors: {} };
      });
      return next;
    });
  };

  const hasErrors  = Object.values(entries).some((e) => Object.keys(e.errors).length > 0);
  const dirtyCount = Object.values(entries).filter((e) => e.dirty).length;

  const saveAll = async () => {
    if (hasErrors)  { toast.error('Fix validation errors before saving'); return; }
    if (!dirtyCount) { toast.info('No changes to save'); return; }

    const dirty = Object.entries(entries)
      .filter(([, e]) => e.dirty)
      .map(([empId, e]) => ({
        employee: empId,
        status:   e.status,
        checkIn:  e.checkIn  || undefined,
        checkOut: e.checkOut || undefined,
        notes:    e.notes    || undefined,
      }));

    setSaving(true);
    try {
      await api.post('/hr/attendance/bulk', { date, records: dirty });
      toast.success(`Saved ${dirty.length} record${dirty.length > 1 ? 's' : ''}`);
      await loadDay(date);
    } catch (err) {
      toast.error(apiErrMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const filtered = employees.filter((e) =>
    !search ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.department?.toLowerCase().includes(search.toLowerCase())
  );

  const counts = Object.values(entries).reduce(
    (acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-4">
      {/* Date + Quick-mark row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Date</label>
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border outline-none cursor-pointer"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Quick mark all:</span>
          {(Object.entries(STATUS_CONFIG) as [AttendanceRecord['status'], typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]][]).map(([k, cfg]) => (
            <button
              key={k}
              onClick={() => markAll(k)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer hover:opacity-80"
              style={{ color: cfg.color, backgroundColor: cfg.bg }}
            >
              {cfg.icon} {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <StatCards counts={counts} />

      {/* Search + Save */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Filter employees…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border outline-none"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        {hasErrors && (
          <p className="text-xs font-medium" style={{ color: 'var(--error)' }}>Fix errors to save</p>
        )}
        <button
          onClick={saveAll}
          disabled={saving || dirtyCount === 0 || hasErrors}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl text-white transition-all disabled:opacity-50 cursor-pointer hover:opacity-90 ml-auto"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Check size={13} />
          {saving ? 'Saving…' : `Save${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-muted)' }}>
                {['Employee', 'Check In', 'Check Out', 'Hours', 'Status', 'Notes'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-8 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--surface-muted)' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14">
                    <CalendarDays size={28} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {search ? 'No employees match your search' : 'No active employees found'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => {
                  const entry = entries[emp._id];
                  if (!entry) return null;
                  const isDirty = entry.dirty;
                  return (
                    <tr
                      key={emp._id}
                      className="transition-colors"
                      style={{
                        borderBottom: '1px solid var(--border)',
                        backgroundColor: isDirty ? 'rgba(var(--accent-rgb,59,130,246),0.04)' : undefined,
                      }}
                    >
                      {/* Employee */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar emp={emp} />
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{emp.name}</p>
                            {emp.department && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{emp.department}</p>}
                          </div>
                          {isDirty && (
                            <span className="w-1.5 h-1.5 rounded-full ml-1 flex-shrink-0" style={{ backgroundColor: 'var(--accent)' }} />
                          )}
                        </div>
                      </td>
                      {/* Check In */}
                      <td className="px-4 py-2.5">
                        <TimeInput
                          value={entry.checkIn}
                          onChange={(v) => updateEntry(emp._id, { checkIn: v })}
                          error={entry.errors.checkIn}
                          disabled={entry.status === 'absent' || entry.status === 'leave'}
                        />
                      </td>
                      {/* Check Out */}
                      <td className="px-4 py-2.5">
                        <TimeInput
                          value={entry.checkOut}
                          onChange={(v) => updateEntry(emp._id, { checkOut: v })}
                          error={entry.errors.checkOut}
                          disabled={entry.status === 'absent' || entry.status === 'leave'}
                        />
                      </td>
                      {/* Hours */}
                      <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                        {workingHours(entry.checkIn, entry.checkOut)}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-2.5">
                        <select
                          value={entry.status}
                          onChange={(e) => updateEntry(emp._id, { status: e.target.value as AttendanceRecord['status'] })}
                          className="px-2 py-1.5 text-xs rounded-lg border outline-none cursor-pointer"
                          style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        >
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                      </td>
                      {/* Notes */}
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={entry.notes}
                          onChange={(e) => updateEntry(emp._id, { notes: e.target.value })}
                          placeholder="Optional…"
                          maxLength={200}
                          className="w-full px-2 py-1.5 text-xs rounded-lg border outline-none min-w-[140px]"
                          style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── RECORDS TAB ──────────────────────────────────────────────────────────────

interface EditState {
  id: string;
  status: AttendanceRecord['status'];
  checkIn: string;
  checkOut: string;
  notes: string;
  errors: { checkIn?: string; checkOut?: string };
}

function RecordsTab({
  currentMonth, setCurrentMonth,
}: { currentMonth: Date; setCurrentMonth: (d: Date) => void }) {
  const [records, setRecords]   = useState<AttendanceRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [editing, setEditing]   = useState<EditState | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = monthBounds(currentMonth);
      const params = new URLSearchParams({ from: start, to: end, limit: '500' });
      if (search)     params.set('search',     search);
      if (deptFilter) params.set('department', deptFilter);
      const { data } = await api.get(`/hr/attendance?${params}`);
      const list: AttendanceRecord[] = data.data?.records || [];
      setRecords(list);
      setDepartments(
        Array.from(new Set(list.map((r) => r.employee?.department).filter(Boolean))) as string[]
      );
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, search, deptFilter]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const startEdit = (rec: AttendanceRecord) => {
    setEditing({ id: rec._id, status: rec.status, checkIn: rec.checkIn ?? '', checkOut: rec.checkOut ?? '', notes: rec.notes ?? '', errors: {} });
  };

  const updateEditField = (patch: Partial<EditState>) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      return { ...next, errors: validateMarkEntry(next.checkIn, next.checkOut) };
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (Object.keys(editing.errors).length > 0) { toast.error('Fix validation errors first'); return; }
    try {
      await api.patch(`/hr/attendance/${editing.id}`, {
        status:   editing.status,
        checkIn:  editing.checkIn  || '',
        checkOut: editing.checkOut || '',
        notes:    editing.notes,
      });
      toast.success('Record updated');
      setEditing(null);
      loadRecords();
    } catch (err) {
      toast.error(apiErrMsg(err));
    }
  };

  const deleteRecord = async (id: string) => {
    const result = await showConfirm('Delete attendance record?', 'Delete this attendance record? This cannot be undone.');
    if (!result.isConfirmed) return;
    setDeletingId(id);
    try {
      await api.delete(`/hr/attendance/${id}`);
      toast.success('Record deleted');
      setRecords((prev) => prev.filter((r) => r._id !== id));
    } catch {
      toast.error('Failed to delete record');
    } finally {
      setDeletingId(null);
    }
  };

  const exportCSV = () => {
    const headers = ['Date', 'Employee', 'Department', 'Check In', 'Check Out', 'Working Hours', 'Status', 'Notes'];
    const rows = records.map((r) => [
      formatDate(r.date),
      r.employee?.name || 'Unknown',
      r.employee?.department || '',
      r.checkIn || '',
      r.checkOut || '',
      workingHours(r.checkIn, r.checkOut),
      STATUS_CONFIG[r.status]?.label || r.status,
      r.notes || '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${currentMonth.toISOString().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = records.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-4">
      <StatCards counts={counts} />

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <MonthNav date={currentMonth} onChange={setCurrentMonth} />
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search employee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border outline-none"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border outline-none cursor-pointer"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border cursor-pointer hover:bg-[var(--surface-muted)] ml-auto transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface)' }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-muted)' }}>
                {['Date', 'Employee', 'Check In', 'Check Out', 'Hours', 'Status', 'Notes', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(7)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-muted)' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <CalendarDays size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No records for this period</p>
                  </td>
                </tr>
              ) : (
                records.map((rec) => {
                  const isEditing = editing?.id === rec._id;
                  return (
                    <tr
                      key={rec._id}
                      className="hover:bg-[var(--surface-muted)] transition-colors"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      {/* Date */}
                      <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                        {formatDate(rec.date)}
                      </td>
                      {/* Employee */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar emp={rec.employee} />
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{rec.employee?.name || 'Unknown'}</p>
                            {rec.employee?.department && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{rec.employee.department}</p>}
                          </div>
                        </div>
                      </td>
                      {/* Check In */}
                      <td className="px-4 py-3">
                        {isEditing && editing
                          ? <TimeInput value={editing.checkIn} onChange={(v) => updateEditField({ checkIn: v })} error={editing.errors.checkIn} />
                          : <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>{rec.checkIn || '—'}</span>}
                      </td>
                      {/* Check Out */}
                      <td className="px-4 py-3">
                        {isEditing && editing
                          ? <TimeInput value={editing.checkOut} onChange={(v) => updateEditField({ checkOut: v })} error={editing.errors.checkOut} />
                          : <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>{rec.checkOut || '—'}</span>}
                      </td>
                      {/* Hours */}
                      <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {isEditing && editing
                          ? workingHours(editing.checkIn, editing.checkOut)
                          : workingHours(rec.checkIn, rec.checkOut)}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        {isEditing && editing
                          ? (
                            <select
                              value={editing.status}
                              onChange={(e) => updateEditField({ status: e.target.value as AttendanceRecord['status'] })}
                              className="px-2 py-1.5 text-xs rounded-lg border outline-none cursor-pointer"
                              style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                            >
                              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          )
                          : <StatusBadge status={rec.status} />}
                      </td>
                      {/* Notes */}
                      <td className="px-4 py-3">
                        {isEditing && editing
                          ? (
                            <input
                              type="text"
                              value={editing.notes}
                              onChange={(e) => updateEditField({ notes: e.target.value })}
                              placeholder="Notes…"
                              maxLength={200}
                              className="w-full px-2 py-1.5 text-xs rounded-lg border outline-none min-w-[130px]"
                              style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                            />
                          )
                          : <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{rec.notes || '—'}</span>}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={saveEdit}
                              disabled={Object.keys(editing?.errors ?? {}).length > 0}
                              className="p-1.5 rounded-lg text-white cursor-pointer hover:opacity-90 disabled:opacity-50"
                              style={{ backgroundColor: 'var(--accent)' }}
                              title="Save"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="p-1.5 rounded-lg border cursor-pointer hover:bg-[var(--surface-muted)]"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                              title="Cancel"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEdit(rec)}
                              className="p-1.5 rounded-lg border cursor-pointer hover:bg-[var(--surface-muted)] transition-colors"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                              title="Edit"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => deleteRecord(rec._id)}
                              disabled={deletingId === rec._id}
                              className="p-1.5 rounded-lg border cursor-pointer transition-colors disabled:opacity-50"
                              style={{ borderColor: 'var(--border)', color: 'var(--error)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--error-subtle)')}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {records.length > 0 && (
          <div className="px-4 py-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{records.length} record{records.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SUMMARY TAB ──────────────────────────────────────────────────────────────

function SummaryTab({
  currentMonth, setCurrentMonth,
}: { currentMonth: Date; setCurrentMonth: (d: Date) => void }) {
  const [stats, setStats]     = useState<EmployeeStat[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = monthBounds(currentMonth);
      const { data } = await api.get(`/hr/attendance/stats?from=${start}&to=${end}`);
      setStats(data.data?.stats || []);
    } catch {
      setStats([]);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="space-y-4">
      <MonthNav date={currentMonth} onChange={setCurrentMonth} />

      <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-muted)' }}>
                {['Employee', 'Department', 'Present', 'Late', 'Absent', 'On Leave', 'Total Days', 'Attendance'].map((h) => (
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
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-muted)' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : stats.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>
                    No attendance data for this period
                  </td>
                </tr>
              ) : (
                stats.map((s) => {
                  const pct = s.total > 0 ? Math.round(((s.present + s.late) / s.total) * 100) : 0;
                  const pctColor = pct >= 90 ? 'var(--success)' : pct >= 70 ? 'var(--warning)' : 'var(--error)';
                  return (
                    <tr
                      key={s.employee._id}
                      className="hover:bg-[var(--surface-muted)] transition-colors"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.employee.name}</p>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                        {s.employee.department || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>{s.present}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold" style={{ color: 'var(--warning)' }}>{s.late}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold" style={{ color: 'var(--error)' }}>{s.absent}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold" style={{ color: 'var(--info)' }}>{s.leave}</span>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {s.total}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-muted)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: pctColor }}
                            />
                          </div>
                          <span className="text-xs font-bold min-w-[36px]" style={{ color: pctColor }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {stats.length > 0 && (
          <div className="px-4 py-2.5 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Attendance % = (Present + Late) ÷ Total recorded days
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

type Tab = 'daily' | 'records' | 'summary';

export default function AttendancePage() {
  const [activeTab, setActiveTab]       = useState<Tab>('daily');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'daily',   label: 'Daily Mark',      icon: <CheckSquare size={13} /> },
    { id: 'records', label: 'Records',          icon: <ClipboardList size={13} /> },
    { id: 'summary', label: 'Monthly Summary',  icon: <BarChart3 size={13} /> },
  ];

  return (
    <div className="p-6 max-w-7xl w-full space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Attendance Tracking</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Mark daily attendance, track check-in / check-out times and view monthly summaries
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'var(--surface-muted)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-lg transition-all cursor-pointer"
            style={{
              backgroundColor: activeTab === tab.id ? 'var(--surface)' : 'transparent',
              color:           activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow:       activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'daily'   && <DailyMarkTab />}
      {activeTab === 'records' && <RecordsTab currentMonth={currentMonth} setCurrentMonth={setCurrentMonth} />}
      {activeTab === 'summary' && <SummaryTab  currentMonth={currentMonth} setCurrentMonth={setCurrentMonth} />}
    </div>
  );
}
