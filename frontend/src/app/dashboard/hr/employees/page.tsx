'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Download, Users,
  ChevronUp, ChevronDown, Eye, Pencil, Trash2,
  UserCheck, UserX, Clock,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { api } from '@/lib/api';
import { showConfirm } from '@/lib/sweetalert';

interface Employee {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  jobTitle?: string;
  employeeId?: string;
  status: 'active' | 'inactive' | 'on_leave';
  startDate?: string;
  profileImage?: { url: string };
}

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  active:   { text: 'var(--success)',  bg: 'var(--success-subtle)' },
  inactive: { text: 'var(--error)',    bg: 'var(--error-subtle)' },
  on_leave: { text: 'var(--warning)',  bg: 'var(--warning-subtle)' },
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active', inactive: 'Inactive', on_leave: 'On Leave',
};

type SortKey = 'name' | 'department' | 'jobTitle' | 'startDate' | 'status';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (departmentFilter) params.set('department', departmentFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('sortBy', sortKey);
      params.set('sortDir', sortDir);
      const { data } = await api.get(`/hr/employees?${params.toString()}`);
      const list: Employee[] = data.data?.employees || data.data || [];
      setEmployees(list);
      const depts = Array.from(new Set(list.map((e) => e.department).filter(Boolean))) as string[];
      setDepartments(depts);
    } catch {
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [search, departmentFilter, statusFilter, sortKey, sortDir]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const handleDelete = async (id: string) => {
    const result = await showConfirm('Delete employee?', 'Delete this employee? This cannot be undone.');
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/hr/employees/${id}`);
      toast.success('Employee deleted');
      fetchEmployees();
    } catch {
      toast.error('Failed to delete employee');
    }
    setActiveMenu(null);
  };

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Phone', 'Department', 'Job Title', 'Status', 'Start Date'];
    const rows = employees.map((e) => [
      e.name, e.email, e.phone || '', e.department || '', e.jobTitle || '',
      STATUS_LABELS[e.status] || e.status, e.startDate ? new Date(e.startDate).toLocaleDateString() : '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'employees.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
      : null;

  const initials = (name: string) =>
    name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Employee Directory
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {loading ? '…' : `${employees.length} employee${employees.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border transition-all cursor-pointer hover:bg-[var(--surface-muted)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface)' }}
          >
            <Download size={14} /> Export
          </button>
          <Link
            href="/dashboard/hr/employees/new"
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl text-white transition-all hover:opacity-90"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Plus size={14} /> Add Employee
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by name, email, job title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border outline-none transition-all"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="px-3 py-2.5 text-sm rounded-xl border outline-none cursor-pointer"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 text-sm rounded-xl border outline-none cursor-pointer"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="on_leave">On Leave</option>
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
                {([
                  ['name', 'Employee'],
                  ['department', 'Department'],
                  ['jobTitle', 'Job Title'],
                  ['startDate', 'Start Date'],
                  ['status', 'Status'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <div className="flex items-center gap-1">
                      {label} <SortIcon col={key} />
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-right" style={{ color: 'var(--text-muted)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="wait">
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="px-4 py-4">
                          <div className="h-4 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-muted)' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center"
                          style={{ backgroundColor: 'var(--surface-muted)' }}
                        >
                          <Users size={24} style={{ color: 'var(--text-muted)' }} />
                        </div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                          No employees found
                        </p>
                        <Link
                          href="/dashboard/hr/employees/new"
                          className="text-sm font-semibold hover:underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          Add your first employee
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  employees.map((emp, i) => (
                    <motion.tr
                      key={emp._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="group transition-colors hover:bg-[var(--surface-muted)]"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      {/* Employee name + avatar */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-[11px] font-bold text-white"
                            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-info))' }}
                          >
                            {emp.profileImage?.url
                              ? <img src={emp.profileImage.url} alt={emp.name} className="w-full h-full object-cover" />
                              : initials(emp.name)
                            }
                          </div>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {emp.name}
                            </p>
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              {emp.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {emp.department || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {emp.jobTitle || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {emp.startDate
                          ? new Date(emp.startDate).toLocaleDateString()
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                          style={{
                            color: STATUS_COLORS[emp.status]?.text ?? 'var(--text-muted)',
                            backgroundColor: STATUS_COLORS[emp.status]?.bg ?? 'var(--surface-muted)',
                          }}
                        >
                          {emp.status === 'active'
                            ? <UserCheck size={10} />
                            : emp.status === 'inactive'
                              ? <UserX size={10} />
                              : <Clock size={10} />}
                          {STATUS_LABELS[emp.status] ?? emp.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 relative">
                          <Link
                            href={`/dashboard/hr/employees/${emp._id}`}
                            className="p-1.5 rounded-lg hover:bg-[var(--accent-subtle)] transition-colors"
                            title="View profile"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Eye size={14} />
                          </Link>
                          <Link
                            href={`/dashboard/hr/employees/${emp._id}?edit=true`}
                            className="p-1.5 rounded-lg hover:bg-[var(--accent-subtle)] transition-colors"
                            title="Edit"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Pencil size={14} />
                          </Link>
                          <button
                            onClick={() => handleDelete(emp._id)}
                            className="p-1.5 rounded-lg hover:bg-[var(--error-subtle)] transition-colors cursor-pointer"
                            title="Delete"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

