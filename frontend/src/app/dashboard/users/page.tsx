'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Users, Plus, Search, ShieldCheck, Lock, Unlock, LogOut, MessageCircle,
  Network, Clock3, Activity, X, Loader2, Trash2, Eye, EyeOff, RefreshCw, Pencil, Copy, Mail,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { showConfirm } from '@/lib/sweetalert';

/* ═══════════════════════════════════════════════════════════════
   ANIMATION PRIMITIVES
   ═══════════════════════════════════════════════════════════════ */

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 280, damping: 24 },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1, scale: 1,
    transition: { type: 'spring' as const, stiffness: 320, damping: 22 },
  },
};

const slideRight = {
  hidden: { opacity: 0, x: -16 },
  show: {
    opacity: 1, x: 0,
    transition: { type: 'spring' as const, stiffness: 280, damping: 24 },
  },
};

const slideLeft = {
  hidden: { opacity: 0, x: 16 },
  show: {
    opacity: 1, x: 0,
    transition: { type: 'spring' as const, stiffness: 280, damping: 24 },
  },
};

/* modal overlay + content */
const overlayVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 20 },
  show: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: 'spring' as const, stiffness: 340, damping: 26, delay: 0.05 },
  },
  exit: {
    opacity: 0, scale: 0.92, y: 20,
    transition: { duration: 0.15 },
  },
};

/* profile panel swap */
const profileVariants = {
  hidden: { opacity: 0, x: 30 },
  show: {
    opacity: 1, x: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 26 },
  },
  exit: {
    opacity: 0, x: -20,
    transition: { duration: 0.15 },
  },
};

/* ═══════════════════════════════════════════════════════════════
   ANIMATED NUMBER (count-up)
   ═══════════════════════════════════════════════════════════════ */

function useCountUp(target: number, duration = 600) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return count;
}

function AnimatedNumber({ value }: { value: number }) {
  const n = useCountUp(value);
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {n.toLocaleString()}
    </motion.span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SKELETON LOADER
   ═══════════════════════════════════════════════════════════════ */

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <motion.div
      className={`rounded-lg ${className}`}
      style={{ backgroundColor: 'var(--surface-muted)' }}
      animate={{ opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4 p-2">
      <div className="flex items-center gap-3">
        <Skeleton className="w-14 h-14 rounded-xl" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 space-y-3">
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Skeleton className="xl:col-span-2 h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TYPES & CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  roles?: string[];
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  isLocked?: boolean;
  profileImage?: { url?: string };
}

interface Session {
  _id: string;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  updatedAt: string;
}

interface ActivityItem {
  _id: string;
  action: string;
  resource?: string;
  method?: string;
  ipAddress?: string;
  timestamp?: string;
}

interface UserProfileData {
  user: User & { failedLoginAttempts?: number; lockoutUntil?: string; profileImage?: { url?: string } };
  security: { failedLoginAttempts: number; lockoutUntil?: string; isLocked: boolean };
  sessions: Session[];
  activities: ActivityItem[];
  ipHistory: { ip: string; count: number }[];
}

const ROLE_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  super_admin:       { text: 'var(--error)',    bg: 'rgba(225,29,72,0.10)',   border: 'rgba(225,29,72,0.30)' },
  admin:             { text: '#c2410c',         bg: 'rgba(194,65,12,0.10)',   border: 'rgba(194,65,12,0.30)' },
  hr:                { text: '#db2777',         bg: 'rgba(219,39,119,0.10)',  border: 'rgba(219,39,119,0.30)' },
  sales:             { text: 'var(--success)',   bg: 'rgba(5,150,105,0.10)',   border: 'rgba(5,150,105,0.30)' },
  content_creator:   { text: 'var(--accent)',    bg: 'var(--accent-subtle)',   border: 'var(--accent-border)' },
  seo_manager:       { text: 'var(--accent)',    bg: 'var(--accent-subtle)',   border: 'var(--accent-border)' },
  support_executive: { text: '#b45309',         bg: 'rgba(180,83,9,0.10)',    border: 'rgba(180,83,9,0.30)' },
  finance_manager:   { text: 'var(--success)',   bg: 'rgba(5,150,105,0.10)',   border: 'rgba(5,150,105,0.30)' },
};

const STAT_STYLES: Record<string, { text: string }> = {
  violet: { text: 'var(--accent)' },
  green:  { text: 'var(--success)' },
  orange: { text: '#c2410c' },
  red:    { text: 'var(--error)' },
};

const ALL_ROLES = ['hr', 'sales', 'content_creator', 'seo_manager', 'support_executive', 'finance_manager', 'admin', 'super_admin'];

function generateSecurePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  let pwd = '';
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  pwd += symbols[Math.floor(Math.random() * symbols.length)];
  for (let i = 4; i < length; i++) pwd += all[Math.floor(Math.random() * all.length)];
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

function parseUserAgent(ua: string): string {
  if (!ua || ua === 'Unknown user-agent') return 'Unknown';
  const u = ua.toLowerCase();
  let browser = 'Browser';
  if (u.includes('edg/')) browser = 'Edge';
  else if (u.includes('chrome') && !u.includes('chromium')) browser = 'Chrome';
  else if (u.includes('firefox')) browser = 'Firefox';
  else if (u.includes('safari') && !u.includes('chrome')) browser = 'Safari';
  let os = '';
  if (u.includes('windows')) os = 'Windows';
  else if (u.includes('mac')) os = 'Mac';
  else if (u.includes('linux')) os = 'Linux';
  else if (u.includes('android')) os = 'Android';
  else if (u.includes('iphone') || u.includes('ipad')) os = 'iOS';
  return os ? `${browser} on ${os}` : browser;
}

const ACTIVITY_INITIAL = 5;
const SESSIONS_INITIAL = 5;

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<UserProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', roles: ['sales'] as string[], phone: '', jobTitle: '', department: '' });
  const [creating, setCreating] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserIsSuperAdmin, setCurrentUserIsSuperAdmin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [editUser, setEditUser] = useState<{ _id: string; name: string; email: string; roles: string[]; phone?: string; jobTitle?: string; department?: string } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<{ name: string; email: string; password: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/admin/users');
      setUsers(data.data.users || []);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    api.get('/auth/profile').then(({ data }) => {
      const user = data?.data?.user || data?.data;
      if (user?._id) setCurrentUserId(user._id);
      const roles = user?.roles?.length ? user.roles : (user?.role ? [user.role] : []);
      setCurrentUserIsSuperAdmin(roles.includes('super_admin'));
    }).catch(() => {});
  }, []);

  const openCreateModal = () => {
    setForm({ name: '', email: '', password: generateSecurePassword(), roles: ['sales'], phone: '', jobTitle: '', department: '' });
    setShowPassword(false);
    setCreateSuccess(null);
    setShowModal(true);
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const pwd = form.password;
    try {
      await api.post('/auth/admin/users', {
        name: form.name,
        email: form.email,
        password: form.password,
        roles: form.roles,
        phone: form.phone,
        jobTitle: form.jobTitle || undefined,
        department: form.department || undefined,
      });
      setCreateSuccess({ name: form.name, email: form.email, password: pwd });
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create user');
    } finally { setCreating(false); }
  };

  const closeCreateModal = () => {
    setShowModal(false);
    setCreateSuccess(null);
    setForm({ name: '', email: '', password: '', roles: ['sales'], phone: '', jobTitle: '', department: '' });
  };

  const copyPassword = async () => {
    if (!createSuccess?.password) return;
    try {
      await navigator.clipboard.writeText(createSuccess.password);
      toast.success('Password copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const sendPasswordReset = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await api.post(`/auth/admin/users/${userId}/send-password-reset`, {});
      toast.success('Password reset email sent to user');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to send reset email');
    } finally { setBusyUserId(null); }
  };

  const openUserProfile = async (userId: string) => {
    setSelectedUserId(userId);
    setProfileLoading(true);
    setSelectedProfile(null);
    try {
      const { data } = await api.get(`/auth/admin/users/${userId}/profile`);
      setSelectedProfile(data.data);
    } catch {
      toast.error('Failed to load user profile');
      setSelectedUserId(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const forceLogout = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await api.post(`/auth/admin/users/${userId}/force-logout`, {});
      toast.success('User forced to logout');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to force logout');
    } finally { setBusyUserId(null); }
  };

  const lockUser = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await api.post(`/auth/admin/users/${userId}/lock`, { minutes: 60 });
      toast.success('User locked for 60 minutes');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to lock user');
    } finally { setBusyUserId(null); }
  };

  const unlockUser = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await api.post(`/auth/admin/users/${userId}/unlock`, {});
      toast.success('User unlocked');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to unlock user');
    } finally { setBusyUserId(null); }
  };

  const updateUserSubmit = async (e: React.FormEvent) => {
    if (!editUser) return;
    e.preventDefault();
    const userId = editUser._id;
    setUpdating(true);
    try {
      await api.patch(`/auth/admin/users/${userId}`, {
        name: editUser.name,
        email: editUser.email,
        roles: editUser.roles,
        phone: editUser.phone || undefined,
        jobTitle: editUser.jobTitle || undefined,
        department: editUser.department || undefined,
      });
      toast.success('User updated successfully');
      setEditUser(null);
      fetchUsers();
      if (selectedUserId === userId) {
        openUserProfile(userId);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update user');
    } finally { setUpdating(false); }
  };

  const deleteUser = async (userId: string, name: string, email: string) => {
    const result = await showConfirm('Delete user?', `Are you sure you want to permanently delete ${name} (${email})? All sessions and data will be removed.`);
    if (!result.isConfirmed) return;

    setBusyUserId(userId);
    try {
      await api.delete(`/auth/admin/users/${userId}`);
      toast.success('User deleted successfully');
      await fetchUsers();
      if (selectedUserId === userId) {
        setSelectedUserId(null);
        setSelectedProfile(null);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete user');
    } finally { setBusyUserId(null); }
  };

  const filtered = users.filter((u) => {
    const roles = (u as any).roles?.length ? (u as any).roles : [u.role];
    return (
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      roles.some((r: string) => r.toLowerCase().includes(search.toLowerCase()))
    );
  });

  useEffect(() => {
    if (!selectedUserId && filtered.length > 0) {
      openUserProfile(filtered[0]._id);
    }
  }, [filtered, selectedUserId]);

  useEffect(() => {
    setShowAllActivity(false);
    setShowAllSessions(false);
  }, [selectedUserId]);

  /* ── Full-page loading ── */
  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ backgroundColor: 'var(--bg)' }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 border-4 border-t-transparent rounded-full"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
      />
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        Loading users...
      </motion.p>
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
      {/* ═══════════════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <motion.div
              className="p-2 rounded-xl"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
              whileHover={{ rotate: [0, -8, 8, 0], scale: 1.1 }}
              transition={{ duration: 0.4 }}
            >
              <Users size={22} style={{ color: 'var(--accent)' }} />
            </motion.div>
            Users & Roles
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Manage team members and access permissions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/dashboard/roles-permissions"
              className="flex items-center gap-2 px-4 py-2.5 border rounded-xl font-semibold text-sm transition-colors cursor-pointer"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <Activity size={15} /> Permission Matrix
            </Link>
          </motion.div>
          <motion.button
            onClick={openCreateModal}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm cursor-pointer text-white"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Plus size={16} /> Add User
          </motion.button>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          STATS ROW
          ═══════════════════════════════════════════════════════════ */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
      >
        {[
          { label: 'Total Users', value: users.length, accent: 'violet' },
          { label: 'Active', value: users.filter(u => u.isActive).length, accent: 'green' },
          { label: 'Admins', value: users.filter(u => ((u as any).roles?.length ? (u as any).roles : [u.role]).some((r: string) => ['admin', 'super_admin'].includes(r))).length, accent: 'orange' },
          { label: 'Inactive', value: users.filter(u => !u.isActive).length, accent: 'red' },
        ].map(s => (
          <motion.div
            key={s.label}
            variants={scaleIn}
            whileHover={{
              y: -4,
              scale: 1.02,
              transition: { type: 'spring', stiffness: 400, damping: 20 },
            }}
            whileTap={{ scale: 0.98 }}
            className="border rounded-xl p-4 cursor-pointer"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            <p className="text-3xl font-bold" style={{ color: STAT_STYLES[s.accent].text }}>
              <AnimatedNumber value={s.value} />
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          SEARCH — with focus animation
          ═══════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 24 }}
        className="relative mb-6"
      >
        <motion.div
          animate={searchFocused ? { scale: 1.1, x: -2 } : { scale: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="absolute left-4 top-1/2 -translate-y-1/2"
        >
          <Search size={16} style={{ color: searchFocused ? 'var(--accent)' : 'var(--text-muted)' }} />
        </motion.div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="Search users by name, email or role…"
          className="w-full pl-10 pr-4 py-3 border rounded-xl text-sm focus:outline-none transition-all duration-200"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: searchFocused ? 'var(--accent)' : 'var(--border)',
            color: 'var(--text-primary)',
            boxShadow: searchFocused ? '0 0 0 3px var(--focus)' : 'none',
          }}
        />
        {/* Clear button */}
        <AnimatePresence>
          {search.length > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg cursor-pointer"
              style={{ backgroundColor: 'var(--surface-muted)' }}
            >
              <X size={14} style={{ color: 'var(--text-muted)' }} />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          WORKSPACE — Left list + Right detail
          ═══════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 24 }}
        className="grid grid-cols-1 xl:grid-cols-12 gap-4"
      >
        {/* ── LEFT: User list ─────────────────────────────────────── */}
        <motion.div
          variants={slideRight}
          initial="hidden"
          animate="show"
          className="xl:col-span-4 border rounded-2xl p-3"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">User Management</h2>
            <motion.span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}
              key={filtered.length}
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
            >
              {filtered.length}
            </motion.span>
          </div>

          <div className="space-y-2 max-h-[760px] overflow-y-auto overflow-x-hidden pr-1">
            <AnimatePresence mode="popLayout">
              {filtered.map((user, index) => (
                <motion.button
                  key={user._id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20, scale: 0.95 }}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 24,
                    delay: index * 0.03,
                  }}
                  whileHover={{
                    x: 4,
                    transition: { type: 'spring', stiffness: 400, damping: 20 },
                  }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => openUserProfile(user._id)}
                  className="w-full text-left rounded-xl border p-3 cursor-pointer"
                  style={{
                    backgroundColor: selectedUserId === user._id ? 'var(--accent-subtle)' : 'var(--bg)',
                    borderColor: selectedUserId === user._id ? 'var(--accent-border)' : 'var(--border)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <motion.div
                      className="w-10 h-10 rounded-full border flex items-center justify-center flex-shrink-0 overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, var(--accent-subtle), rgba(124,58,237,0.14))',
                        borderColor: selectedUserId === user._id ? 'var(--accent)' : 'var(--accent-border)',
                      }}
                      animate={selectedUserId === user._id ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      {user.profileImage?.url ? (
                        <img src={user.profileImage.url} alt={`${user.name} avatar`} className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-bold text-xs" style={{ color: 'var(--accent)' }}>
                          {user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                        </span>
                      )}
                    </motion.div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {user.name}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user.email}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {((user as any).roles?.length ? (user as any).roles : [user.role]).slice(0, 2).map((r: string) => (
                          <span
                            key={r}
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{ backgroundColor: (ROLE_COLORS[r] || ROLE_COLORS.sales).bg, color: (ROLE_COLORS[r] || ROLE_COLORS.sales).text }}
                          >
                            {r.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {((user as any).roles?.length || 0) > 2 && (
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>+{((user as any).roles?.length || 1) - 2}</span>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <motion.span
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
                      style={user.isLocked
                        ? { backgroundColor: 'rgba(225,29,72,0.12)', color: 'var(--error)' }
                        : { backgroundColor: 'rgba(5,150,105,0.12)', color: 'var(--success)' }
                      }
                    >
                      {user.isLocked ? (
                        <motion.div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: 'var(--error)' }}
                          animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
                      ) : (
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: 'var(--success)' }}
                        />
                      )}
                      {user.isLocked ? 'Locked' : 'Active'}
                    </motion.span>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>

            {filtered.length === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
              >
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Search size={28} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                </motion.div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No users found</p>
                {search && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    onClick={() => setSearch('')}
                    className="text-xs mt-2 underline cursor-pointer"
                    style={{ color: 'var(--accent)' }}
                  >
                    Clear search
                  </motion.button>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* ── RIGHT: User detail panel ────────────────────────────── */}
        <motion.div
          variants={slideLeft}
          initial="hidden"
          animate="show"
          className="xl:col-span-8 border rounded-2xl p-5"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {/* Loading skeleton */}
          {profileLoading && <ProfileSkeleton />}

          {/* Empty state */}
          {!profileLoading && !selectedProfile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Users size={40} style={{ color: 'var(--text-muted)' }} />
              </motion.div>
              <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                Select a user to view details
              </p>
            </motion.div>
          )}

          {/* Profile content */}
          <AnimatePresence mode="wait">
            {!profileLoading && selectedProfile && (
              <motion.div
                key={selectedProfile.user._id}
                variants={profileVariants}
                initial="hidden"
                animate="show"
                exit="exit"
                className="space-y-4"
              >
                {(() => {
                  const displayRoles = (selectedProfile.user as any).roles?.length ? (selectedProfile.user as any).roles : [selectedProfile.user.role];
                  return (
                    <>
                      {/* ── Profile header + actions ── */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <motion.div
                          className="flex items-center gap-3"
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.05 }}
                        >
                          <motion.div
                            className="w-14 h-14 rounded-xl border flex items-center justify-center overflow-hidden"
                            style={{ backgroundColor: 'var(--accent-subtle)', borderColor: 'var(--accent-border)' }}
                            whileHover={{ scale: 1.08, rotate: -3 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                          >
                            {selectedProfile.user.profileImage?.url ? (
                              <img src={selectedProfile.user.profileImage.url} alt={`${selectedProfile.user.name} avatar`} className="w-full h-full object-cover" />
                            ) : (
                              <span className="font-bold" style={{ color: 'var(--accent)' }}>
                                {selectedProfile.user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                              </span>
                            )}
                          </motion.div>
                          <div>
                            <h3 className="text-2xl font-bold">{selectedProfile.user.name}</h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              {displayRoles.map((r: string, i: number) => {
                                const rs = ROLE_COLORS[r] || ROLE_COLORS.sales;
                                return (
                                  <motion.span
                                    key={r}
                                    className="text-xs px-2 py-0.5 rounded-full border font-semibold"
                                    style={{ color: rs.text, backgroundColor: rs.bg, borderColor: rs.border }}
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: 0.05 + i * 0.03 }}
                                  >
                                    {r.replace(/_/g, ' ')}
                                  </motion.span>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard.writeText(selectedProfile.user._id); toast.success('ID copied'); }}
                              className="text-[10px] mt-1 truncate max-w-[180px] block text-left hover:underline cursor-pointer"
                              style={{ color: 'var(--text-muted)' }}
                              title={selectedProfile.user._id}
                            >
                              {selectedProfile.user._id.slice(0, 12)}…
                            </button>
                          </div>
                        </motion.div>

                        {/* Action buttons */}
                        <motion.div
                          className="flex flex-wrap gap-2"
                          initial={{ opacity: 0, x: 12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.1 }}
                        >
                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                            className="px-3 py-2 rounded-xl border text-sm cursor-not-allowed opacity-60"
                            style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                          >
                            <MessageCircle size={14} className="inline mr-1" /> Direct Chat
                          </motion.button>

                          {selectedProfile.user._id !== currentUserId && (
                            <motion.button
                              type="button"
                              onClick={() => sendPasswordReset(selectedProfile.user._id)}
                              disabled={busyUserId === selectedProfile.user._id}
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.96 }}
                              className="px-3 py-2 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50 text-white"
                              style={{ backgroundColor: 'var(--accent)' }}
                              onMouseEnter={(e) => !(busyUserId === selectedProfile.user._id) && (e.currentTarget.style.backgroundColor = 'var(--accent-strong)')}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
                            >
                              {busyUserId === selectedProfile.user._id ? (
                                <Loader2 size={14} className="inline mr-1 animate-spin" />
                              ) : (
                                <Mail size={14} className="inline mr-1" />
                              )}
                              Send Password Reset
                            </motion.button>
                          )}

                          {selectedProfile.user._id !== currentUserId && (currentUserIsSuperAdmin || !((selectedProfile.user as any).roles || [selectedProfile.user.role]).includes('super_admin')) && (
                            <motion.button
                              type="button"
                              onClick={() => setEditUser({ _id: selectedProfile.user._id, name: selectedProfile.user.name, email: selectedProfile.user.email, roles: (selectedProfile.user as any).roles?.length ? (selectedProfile.user as any).roles : [selectedProfile.user.role], phone: (selectedProfile.user as any).phone, jobTitle: (selectedProfile.user as any).jobTitle, department: (selectedProfile.user as any).department })}
                              disabled={busyUserId === selectedProfile.user._id}
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.96 }}
                              className="px-3 py-2 rounded-xl border text-sm cursor-pointer disabled:opacity-50"
                              style={{ backgroundColor: 'var(--accent-subtle)', borderColor: 'var(--accent-border)', color: 'var(--accent-text)' }}
                            >
                              <Pencil size={14} className="inline mr-1" /> Edit User
                            </motion.button>
                          )}

                          <motion.button
                            type="button"
                            onClick={() => forceLogout(selectedProfile.user._id)}
                            disabled={busyUserId === selectedProfile.user._id}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                            className="px-3 py-2 rounded-xl border text-sm cursor-pointer disabled:opacity-50"
                            style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                          >
                            {busyUserId === selectedProfile.user._id ? (
                              <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} className="inline-block">
                                <Loader2 size={14} className="inline mr-1" />
                              </motion.span>
                            ) : (
                              <LogOut size={14} className="inline mr-1" />
                            )}
                            Force Logout
                          </motion.button>

                          {selectedProfile.security.isLocked ? (
                            <motion.button
                              type="button"
                              onClick={() => unlockUser(selectedProfile.user._id)}
                              disabled={busyUserId === selectedProfile.user._id}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.94 }}
                              className="px-3 py-2 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50 text-white"
                              style={{ backgroundColor: 'var(--accent)' }}
                            >
                              <Unlock size={14} className="inline mr-1" /> Unlock Account
                            </motion.button>
                          ) : (!((selectedProfile.user as any).roles || [selectedProfile.user.role]).includes('super_admin') && selectedProfile.user._id !== currentUserId) ? (
                            <motion.button
                              type="button"
                              onClick={() => lockUser(selectedProfile.user._id)}
                              disabled={busyUserId === selectedProfile.user._id}
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.96 }}
                              className="px-3 py-2 rounded-xl border text-sm cursor-pointer disabled:opacity-50"
                              style={{ backgroundColor: 'rgba(225,29,72,0.10)', borderColor: 'rgba(225,29,72,0.30)', color: 'var(--error)' }}
                            >
                              <Lock size={14} className="inline mr-1" /> Lock Account
                            </motion.button>
                          ) : null}
                          {selectedProfile.user._id !== currentUserId && (currentUserIsSuperAdmin || !((selectedProfile.user as any).roles || [selectedProfile.user.role]).includes('super_admin')) && (
                            <motion.button
                              type="button"
                              onClick={() => deleteUser(selectedProfile.user._id, selectedProfile.user.name, selectedProfile.user.email)}
                              disabled={busyUserId === selectedProfile.user._id}
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.96 }}
                              className="px-3 py-2 rounded-xl border text-sm cursor-pointer disabled:opacity-50"
                              style={{ backgroundColor: 'var(--error-subtle)', borderColor: 'var(--error)', color: 'var(--error)' }}
                            >
                              <Trash2 size={14} className="inline mr-1" /> Delete User
                            </motion.button>
                          )}
                        </motion.div>
                      </div>

                      {/* ── Info + IP grid ── */}
                      <motion.div
                        variants={stagger}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-1 lg:grid-cols-3 gap-3"
                      >
                        <motion.div
                          variants={fadeUp}
                          className="lg:col-span-2 border rounded-xl p-4"
                          style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
                          suppressHydrationWarning
                        >
                          <h4 className="font-semibold mb-3">User Information</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {[
                              { label: 'Email', value: selectedProfile.user.email },
                              { label: 'Roles', value: displayRoles.map((r: string) => r.replace(/_/g, ' ')).join(', '), color: (ROLE_COLORS[displayRoles[0]] || ROLE_COLORS.sales).text },
                              { label: 'Phone', value: (selectedProfile.user as any).phone },
                              { label: 'Job Title', value: (selectedProfile.user as any).jobTitle },
                              { label: 'Department', value: (selectedProfile.user as any).department },
                              { label: 'Created', value: new Date(selectedProfile.user.createdAt).toLocaleString() },
                              { label: 'Last Login', value: selectedProfile.user.lastLogin ? new Date(selectedProfile.user.lastLogin).toLocaleString() : 'Never' },
                            ].filter((item) => item.value != null && item.value !== '').map((item, i) => (
                              <motion.p
                                key={item.label}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 + i * 0.05 }}
                              >
                                <span className="text-xs block" style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                                <span style={{ color: item.color || 'var(--text-primary)' }}>{item.value}</span>
                              </motion.p>
                            ))}
                          </div>
                          <motion.div
                            className="mt-3 flex flex-wrap gap-2"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                          >
                            <span
                              className="px-2 py-1 rounded-lg text-xs border"
                              style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }}
                            >
                              Failed Attempts: {selectedProfile.security.failedLoginAttempts}
                            </span>
                            <motion.span
                              className="px-2 py-1 rounded-lg text-xs border flex items-center gap-1"
                              style={selectedProfile.security.isLocked
                                ? { backgroundColor: 'rgba(225,29,72,0.10)', color: 'var(--error)', borderColor: 'rgba(225,29,72,0.20)' }
                                : { backgroundColor: 'rgba(5,150,105,0.10)', color: 'var(--success)', borderColor: 'rgba(5,150,105,0.20)' }
                              }
                            >
                              {selectedProfile.security.isLocked ? (
                                <motion.div
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: 'var(--error)' }}
                                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
                                  transition={{ duration: 1.5, repeat: Infinity }}
                                />
                              ) : (
                                <div
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: 'var(--success)' }}
                                />
                              )}
                              {selectedProfile.security.isLocked ? 'Locked' : 'Normal'}
                            </motion.span>
                          </motion.div>
                        </motion.div>

                        <motion.div
                          variants={fadeUp}
                          className="border rounded-xl p-4"
                          style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
                        >
                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <motion.div
                              whileHover={{ rotate: 15 }}
                              transition={{ type: 'spring', stiffness: 300 }}
                            >
                              <Network size={14} style={{ color: 'var(--accent)' }} />
                            </motion.div>
                            IP Tracking
                          </h4>
                          <div className="space-y-2 text-xs">
                            {selectedProfile.ipHistory.length > 0 ? selectedProfile.ipHistory.map((entry, i) => (
                              <motion.div
                                key={entry.ip}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.06 }}
                                whileHover={{ x: 3, transition: { duration: 0.1 } }}
                                className="flex items-center justify-between p-1.5 rounded-lg cursor-default"
                              >
                                <span style={{ color: 'var(--text-secondary)' }}>{entry.ip}</span>
                                <motion.span
                                  className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
                                  style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}
                                >
                                  {entry.count}
                                </motion.span>
                              </motion.div>
                            )) : <p style={{ color: 'var(--text-muted)' }}>No IP history</p>}
                          </div>
                        </motion.div>
                      </motion.div>

                      {/* ── Activity + Sessions grid ── */}
                      <motion.div
                        variants={stagger}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-1 xl:grid-cols-3 gap-3"
                      >
                        <motion.div
                          variants={fadeUp}
                          className="xl:col-span-2 border rounded-xl p-4"
                          style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
                        >
                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <Clock3 size={14} style={{ color: 'var(--accent)' }} />
                            Recent Activity
                          </h4>
                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            <AnimatePresence>
                              {(selectedProfile.activities || []).slice(0, showAllActivity ? undefined : ACTIVITY_INITIAL).map((activity, i) => (
                                <motion.div
                                  key={activity._id}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 24 }}
                                  className="rounded-lg border p-2.5 text-xs cursor-default"
                                  style={{ borderColor: 'var(--border)' }}
                                >
                                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    {activity.action.replace(/_/g, ' ')}
                                  </p>
                                  <p className="mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                                    {activity.resource || '—'} · {activity.timestamp ? new Date(activity.timestamp).toLocaleString() : ''}
                                  </p>
                                </motion.div>
                              ))}
                            </AnimatePresence>
                            {selectedProfile.activities && selectedProfile.activities.length > ACTIVITY_INITIAL && !showAllActivity && (
                              <button
                                type="button"
                                onClick={() => setShowAllActivity(true)}
                                className="w-full py-2 text-xs font-medium cursor-pointer rounded-lg border border-dashed"
                                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                              >
                                Show {selectedProfile.activities.length - ACTIVITY_INITIAL} more
                              </button>
                            )}
                            {(!selectedProfile.activities || selectedProfile.activities.length === 0) && (
                              <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-xs py-6 text-center"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                No activity logs yet
                              </motion.p>
                            )}
                          </div>
                        </motion.div>

                        <motion.div
                          variants={fadeUp}
                          className="border rounded-xl p-4"
                          style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
                        >
                          <h4 className="font-semibold mb-3 text-sm">Session Snapshot</h4>
                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {selectedProfile.sessions.slice(0, showAllSessions ? undefined : SESSIONS_INITIAL).map((session, i) => (
                              <motion.div
                                key={session._id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="rounded-lg border p-2.5 text-xs cursor-default"
                                style={{ borderColor: 'var(--border)' }}
                              >
                                <p style={{ color: 'var(--text-secondary)' }}>{session.ipAddress || 'Unknown IP'}</p>
                                <p className="mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                  {parseUserAgent(session.userAgent || '')}
                                </p>
                                <div className="mt-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }} suppressHydrationWarning>
                                  {new Date(session.updatedAt).toLocaleString()} ·{' '}
                                  <span className="flex items-center gap-1">
                                    {session.isActive ? (
                                      <motion.span
                                        className="inline-block w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: 'var(--success)' }}
                                        animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                      />
                                    ) : (
                                      <span
                                        className="inline-block w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: 'var(--text-muted)' }}
                                      />
                                    )}
                                    <span style={{ color: session.isActive ? 'var(--success)' : 'var(--text-muted)' }}>
                                      {session.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                  </span>
                                </div>
                              </motion.div>
                            ))}
                            {selectedProfile.sessions.length > SESSIONS_INITIAL && !showAllSessions && (
                              <button
                                type="button"
                                onClick={() => setShowAllSessions(true)}
                                className="w-full py-2 text-xs font-medium cursor-pointer rounded-lg border border-dashed"
                                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                              >
                                Show {selectedProfile.sessions.length - SESSIONS_INITIAL} more
                              </button>
                            )}
                            {selectedProfile.sessions.length === 0 && (
                              <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-xs py-6 text-center"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                No sessions
                              </motion.p>
                            )}
                          </div>
                        </motion.div>
                      </motion.div>
                    </>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          EDIT USER MODAL
          ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {editUser && (
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={(e) => { if (e.target === e.currentTarget) setEditUser(null); }}
          >
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              className="border rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <motion.div whileHover={{ rotate: [0, -10, 10, 0] }} transition={{ duration: 0.4 }}>
                    <Pencil size={20} style={{ color: 'var(--accent)' }} />
                  </motion.div>
                  Edit User
                </h2>
                <motion.button
                  onClick={() => setEditUser(null)}
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-1.5 rounded-lg cursor-pointer"
                  style={{ backgroundColor: 'var(--surface-muted)' }}
                >
                  <X size={16} style={{ color: 'var(--text-muted)' }} />
                </motion.button>
              </div>

              <form onSubmit={updateUserSubmit}>
                <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: 'Full Name', key: 'name' as const, type: 'text', placeholder: 'John Doe' },
                      { label: 'Email Address', key: 'email' as const, type: 'email', placeholder: 'john@company.com' },
                      { label: 'Phone', key: 'phone' as const, type: 'tel', placeholder: '+1 234 567 8900 (7–15 digits)', required: true, pattern: '^[+\\d\\s\\-()]{7,25}$', title: '7–15 digits; may include +, spaces, dashes, parentheses' },
                      { label: 'Job Title', key: 'jobTitle' as const, type: 'text', placeholder: 'e.g. Sales Manager' },
                      { label: 'Department', key: 'department' as const, type: 'text', placeholder: 'e.g. Sales, Engineering' },
                    ].map(f => (
                      <motion.div key={f.key} variants={fadeUp}>
                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
                        <input
                          type={f.type}
                          placeholder={f.placeholder}
                          value={editUser[f.key] || ''}
                          onChange={e => setEditUser(p => p ? { ...p, [f.key]: e.target.value } : null)}
                          required={f.key === 'name' || f.key === 'email' || ('required' in f && f.required)}
                          {...('pattern' in f && (f as any).pattern ? { pattern: (f as any).pattern, title: (f as any).title } : {})}
                          className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none transition-all duration-200"
                          style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--focus)'; }}
                          onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                        />
                      </motion.div>
                    ))}
                  </div>
                  <motion.div variants={fadeUp}>
                    <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Roles</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', border: '1px solid' }}>
                      {ALL_ROLES.map((r) => (
                        <label key={r} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editUser.roles.includes(r)}
                            onChange={(e) => {
                              if (e.target.checked) setEditUser(p => p ? { ...p, roles: [...p.roles, r] } : null);
                              else setEditUser(p => p ? { ...p, roles: p.roles.filter(x => x !== r) } : null);
                            }}
                            className="rounded cursor-pointer"
                            style={{ accentColor: 'var(--accent)' }}
                          />
                          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{r.replace(/_/g, ' ')}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                  <motion.div variants={fadeUp} className="flex gap-3 pt-2">
                    <motion.button
                      type="button"
                      onClick={() => setEditUser(null)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex-1 py-2.5 border rounded-xl text-sm cursor-pointer"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      type="submit"
                      disabled={updating || !editUser.roles.length}
                      whileHover={{ scale: updating ? 1 : 1.03 }}
                      whileTap={{ scale: updating ? 1 : 0.96 }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 text-white cursor-pointer flex items-center justify-center gap-2"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      {updating && (
                        <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} className="inline-block">
                          <Loader2 size={14} />
                        </motion.span>
                      )}
                      {updating ? 'Saving…' : 'Save Changes'}
                    </motion.button>
                  </motion.div>
                </motion.div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════
          CREATE USER MODAL
          ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) closeCreateModal(); }}
          >
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              className="border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <motion.div whileHover={{ rotate: [0, -10, 10, 0] }} transition={{ duration: 0.4 }}>
                    <ShieldCheck size={20} style={{ color: 'var(--accent)' }} />
                  </motion.div>
                  {createSuccess ? 'User Created — Save Password' : 'Create New User'}
                </h2>
                <motion.button
                  onClick={closeCreateModal}
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-1.5 rounded-lg cursor-pointer"
                  style={{ backgroundColor: 'var(--surface-muted)' }}
                >
                  <X size={16} style={{ color: 'var(--text-muted)' }} />
                </motion.button>
              </div>

              {createSuccess ? (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    User <strong style={{ color: 'var(--text-primary)' }}>{createSuccess.name}</strong> ({createSuccess.email}) has been created. Copy the temporary password below — you won&apos;t see it again.
                  </p>
                  <div className="flex items-center gap-2 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', border: '1px solid' }}>
                    <code className="flex-1 font-mono text-sm break-all" style={{ color: 'var(--text-primary)' }}>{createSuccess.password}</code>
                    <motion.button
                      type="button"
                      onClick={copyPassword}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
                      style={{ backgroundColor: 'var(--accent)', color: 'white' }}
                    >
                      <Copy size={14} /> Copy
                    </motion.button>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Or use &quot;Send Password Reset&quot; on the user profile to email them a link to set their own password.
                  </p>
                  <motion.button
                    type="button"
                    onClick={closeCreateModal}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-2.5 rounded-xl text-sm font-bold cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)', color: 'white' }}
                  >
                    Done
                  </motion.button>
                </motion.div>
              ) : (
                <form onSubmit={createUser}>
                  <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { label: 'Full Name', key: 'name' as const, type: 'text', placeholder: 'John Doe', required: true },
                        { label: 'Email Address', key: 'email' as const, type: 'email', placeholder: 'john@company.com', required: true },
                        { label: 'Phone', key: 'phone' as const, type: 'tel', placeholder: '+1 234 567 8900 (7–15 digits)', required: true, pattern: '^[+\\d\\s\\-()]{7,25}$', title: '7–15 digits; may include +, spaces, dashes, parentheses' },
                        { label: 'Job Title', key: 'jobTitle' as const, type: 'text', placeholder: 'e.g. Sales Manager', required: false },
                        { label: 'Department', key: 'department' as const, type: 'text', placeholder: 'e.g. Sales, Engineering', required: false },
                      ].map(f => (
                        <motion.div key={f.key} variants={fadeUp}>
                          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
                          <input
                            type={f.type}
                            placeholder={f.placeholder}
                            value={(form as any)[f.key]}
                            onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                            required={f.required}
                            {...('pattern' in f && f.pattern ? { pattern: f.pattern, title: (f as any).title } : {})}
                            className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none transition-all duration-200"
                            style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                            onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--focus)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                          />
                        </motion.div>
                      ))}
                    </div>

                    <motion.div variants={fadeUp}>
                      <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Roles</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', border: '1px solid' }}>
                        {ALL_ROLES.map((r) => (
                          <label key={r} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.roles.includes(r)}
                              onChange={(e) => {
                                if (e.target.checked) setForm(p => ({ ...p, roles: [...p.roles, r] }));
                                else setForm(p => ({ ...p, roles: p.roles.filter(x => x !== r) }));
                              }}
                              className="rounded cursor-pointer"
                              style={{ accentColor: 'var(--accent)' }}
                            />
                            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{r.replace(/_/g, ' ')}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Select one or more roles. Permissions are merged from all selected roles.</p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <motion.div variants={fadeUp}>
                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                          Temporary Password <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(user can change later)</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Auto-generated"
                            value={form.password}
                            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                            required
                            minLength={8}
                            className="w-full px-4 py-2.5 pr-20 border rounded-xl text-sm focus:outline-none transition-all duration-200"
                            style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                            onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--focus)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <motion.button type="button" onClick={() => setForm(p => ({ ...p, password: generateSecurePassword() }))} title="Generate new" whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }} className="p-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                              <RefreshCw size={14} />
                            </motion.button>
                            <motion.button type="button" onClick={() => setShowPassword(s => !s)} title={showPassword ? 'Hide' : 'Show'} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }} className="p-1.5 rounded-lg cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    </div>

                    <motion.div variants={fadeUp} className="flex gap-3 pt-2">
                      <motion.button type="button" onClick={closeCreateModal} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="flex-1 py-2.5 border rounded-xl text-sm cursor-pointer" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                        Cancel
                      </motion.button>
                      <motion.button type="submit" disabled={creating || form.roles.length === 0} whileHover={{ scale: creating ? 1 : 1.03 }} whileTap={{ scale: creating ? 1 : 0.96 }} className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 text-white cursor-pointer flex items-center justify-center gap-2" style={{ backgroundColor: 'var(--accent)' }}>
                        {creating && <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} className="inline-block"><Loader2 size={14} /></motion.span>}
                        {creating ? 'Creating…' : 'Create User'}
                      </motion.button>
                    </motion.div>
                  </motion.div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}