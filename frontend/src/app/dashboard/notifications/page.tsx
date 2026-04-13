'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, Trash2, RefreshCw, Info, AlertTriangle, CheckCircle, XCircle, Briefcase, DollarSign, LifeBuoy, Settings, Users } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { useRouter } from 'next/navigation';

interface Notification {
  _id: string; title: string; message: string; type: string; isRead: boolean; link?: string; createdAt: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  info:    <Info size={16} className="text-blue-400" />,
  success: <CheckCircle size={16} className="text-green-400" />,
  warning: <AlertTriangle size={16} className="text-yellow-400" />,
  error:   <XCircle size={16} className="text-red-400" />,
  lead:    <Settings size={16} className="text-blue-500" />,
  subscriber: <Users size={16} className="text-cyan-400" />,
  ticket:  <LifeBuoy size={16} className="text-yellow-400" />,
  invoice: <DollarSign size={16} className="text-green-400" />,
  job:     <Briefcase size={16} className="text-orange-400" />,
  system:  <Settings size={16} className="text-purple-400" />,
};

const TYPE_BG: Record<string, string> = {
  info:    'bg-blue-400/10 border-blue-400/20',
  success: 'bg-green-400/10 border-green-400/20',
  warning: 'bg-yellow-400/10 border-yellow-400/20',
  error:   'bg-red-400/10 border-red-400/20',
  lead:    'bg-blue-500/10 border-blue-500/20',
  subscriber: 'bg-cyan-400/10 border-cyan-400/20',
  ticket:  'bg-yellow-400/10 border-yellow-400/20',
  invoice: 'bg-green-400/10 border-green-400/20',
  job:     'bg-orange-400/10 border-orange-400/20',
  system:  'bg-purple-400/10 border-purple-400/20',
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(true);
  const [filter, setFilter]               = useState<'all' | 'unread'>('all');
  const [refreshing, setRefreshing]       = useState(false);

  const fetchNotifications = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = filter === 'unread' ? '?unreadOnly=true' : '';
      const { data } = await api.get(`/notifications${params}`);
      setNotifications(data.data.notifications || []);
      setUnreadCount(data.data.unreadCount || 0);
    } catch { toast.error('Failed to load notifications'); }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/mark-read', {});
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast.success('All marked as read');
    } catch { toast.error('Failed'); }
  };

  const markRead = async (id: string) => {
    try {
      await api.patch('/notifications/mark-read', { ids: [id] });
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(prev - 1, 0));
    } catch { /* silent */ }
  };

  const deleteNotification = async (id: string) => {
    try {
      const target = notifications.find((n) => n._id === id);
      await api.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n._id !== id));
      if (target && !target.isRead) {
        setUnreadCount(prev => Math.max(prev - 1, 0));
      }
    } catch { toast.error('Failed'); }
  };

  const clearRead = async () => {
    try {
      const { data } = await api.delete('/notifications?scope=read');
      const deleted = data?.data?.deletedCount || 0;
      setNotifications((prev) => prev.filter((n) => !n.isRead));
      if (deleted > 0) toast.success(`Cleared ${deleted} read notification${deleted > 1 ? 's' : ''}`);
      else toast.info('No read notifications to clear');
    } catch {
      toast.error('Failed to clear read notifications');
    }
  };

  const clearAll = async () => {
    try {
      const { data } = await api.delete('/notifications?scope=all');
      const deleted = data?.data?.deletedCount || 0;
      setNotifications([]);
      setUnreadCount(0);
      if (deleted > 0) toast.success(`Cleared ${deleted} notification${deleted > 1 ? 's' : ''}`);
      else toast.info('No notifications to clear');
    } catch {
      toast.error('Failed to clear notifications');
    }
  };

  const openNotification = async (notif: Notification) => {
    if (!notif.isRead) {
      await markRead(notif._id);
    }
    if (notif.link) {
      if (notif.link.startsWith('/')) {
        router.push(notif.link);
      } else {
        window.open(notif.link, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const relativeTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(date).toLocaleDateString();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 border-4 border-t-transparent rounded-full"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      className="p-6 min-h-screen" style={{ backgroundColor: 'var(--bg)', color: 'var(--text-primary)' }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="relative">
              <motion.div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-subtle)' }}
                whileHover={{ rotate: [0, -8, 8, 0], scale: 1.08 }} transition={{ duration: 0.4 }}>
                <Bell size={22} style={{ color: 'var(--accent)' }} />
              </motion.div>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            Notifications
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{unreadCount} unread notifications</p>
        </div>
        <div className="flex gap-3">
          {unreadCount > 0 && (
            <motion.button onClick={markAllRead}
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm cursor-pointer"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <Check size={14} /> Mark all read
            </motion.button>
          )}
          <motion.button onClick={fetchNotifications}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm cursor-pointer"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </motion.button>
          <motion.button onClick={clearRead}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm cursor-pointer"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <Trash2 size={14} /> Clear read
          </motion.button>
          <motion.button onClick={clearAll}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm cursor-pointer"
            style={{ backgroundColor: 'var(--error-subtle, rgba(239,68,68,0.1))', borderColor: 'var(--error, #ef4444)', color: 'var(--error, #ef4444)' }}>
            <Trash2 size={14} /> Clear all
          </motion.button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'unread'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all border cursor-pointer"
            style={filter === f
              ? { backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-text)', borderColor: 'var(--accent-border)' }
              : { backgroundColor: 'var(--surface)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
            {f} {f === 'unread' && unreadCount > 0 && `(${unreadCount})`}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="space-y-2">
        <AnimatePresence>
          {notifications.map((notif, i) => (
            <motion.div key={notif._id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}
              transition={{ delay: i * 0.02 }}
              whileHover={{ scale: 1.01 }}
              onClick={() => openNotification(notif)}
              className={`flex items-start gap-4 p-4 rounded-xl border transition-shadow cursor-pointer ${!notif.isRead ? '' : 'opacity-60'}`}
              style={!notif.isRead
                ? { backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }
                : { backgroundColor: 'var(--bg)', borderColor: 'var(--surface)' }}>
              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${TYPE_BG[notif.type] || 'bg-gray-400/10 border-gray-400/20'}`}>
                {TYPE_ICONS[notif.type] || <Bell size={16} className="text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`text-sm font-semibold`} style={{ color: !notif.isRead ? 'var(--text-primary)' : 'var(--text-muted)' }}>{notif.title}</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{notif.message}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!notif.isRead && (
                      <button onClick={(e) => { e.stopPropagation(); markRead(notif._id); }} title="Mark as read"
                        className="text-gray-500 transition-colors cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                        <Check size={13} />
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); deleteNotification(notif._id); }} className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{relativeTime(notif.createdAt)}</p>
                {notif.link && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--accent)' }}>
                    Open related item
                  </p>
                )}
              </div>
              {!notif.isRead && (
                <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2 animate-pulse" style={{ backgroundColor: 'var(--accent)' }} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {notifications.length === 0 && (
          <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
            <Bell size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-lg font-semibold mb-1">All clear!</p>
            <p className="text-sm">No {filter === 'unread' ? 'unread ' : ''}notifications</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
