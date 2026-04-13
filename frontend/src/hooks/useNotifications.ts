'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { connectSocket } from '@/lib/socket';
import api from '@/lib/api';

let notificationAudioContext: AudioContext | null = null;

/** Play a short notification sound (bell) when a new notification arrives. */
async function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!notificationAudioContext) {
      notificationAudioContext = new AudioContextClass();
    }
    const ctx = notificationAudioContext;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.08);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // Ignore if AudioContext not supported or blocked
  }
}

/** Play sound and optionally show browser (desktop) notification. Shows desktop notification when tab is hidden. */
function showBrowserNotification(title: string, body: string, link?: string) {
  if (typeof window === 'undefined') return;
  playNotificationSound();
  if (!('Notification' in window)) return;
  const doShow = () => {
    if (Notification.permission !== 'granted') return;
    // Only show desktop notification when tab is in background (toast is enough when focused)
    if (document.visibilityState === 'visible') return;
    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'nowazone-notification',
      requireInteraction: false,
    });
    if (link) {
      n.onclick = () => {
        window.focus();
        window.location.href = link.startsWith('/') ? `${window.location.origin}${link}` : link;
        n.close();
      };
    }
  };
  if (Notification.permission === 'granted') {
    doShow();
    return;
  }
  if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((p) => {
      if (p === 'granted') doShow();
    });
  }
}

export interface NotificationPayload {
  _id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [latest, setLatest]           = useState<NotificationPayload | null>(null);
  const initialized = useRef(false);

  const fetchCount = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications?unreadOnly=true&limit=1');
      setUnreadCount(data.data?.unreadCount || 0);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    fetchCount();

    // Initialize AudioContext on first user interaction
    const initAudio = async () => {
      try {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!notificationAudioContext) {
          notificationAudioContext = new AudioContextClass();
        }
        if (notificationAudioContext.state === 'suspended') {
          await notificationAudioContext.resume();
        }
      } catch {
        // Ignore
      }
      // Remove listeners after first interaction
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('touchstart', initAudio, { once: true });
    document.addEventListener('keydown', initAudio, { once: true });

    // Connect socket for real-time updates
    const socket = connectSocket();

    socket.on('notification:new', (notif: NotificationPayload & { type?: string; data?: { ticketId?: string } }) => {
      setUnreadCount(prev => prev + 1);
      if (notif.type === 'chat_escalated') {
        toast.info('New ticket from chat');
        showBrowserNotification('New ticket from chat', 'A customer chat was escalated to a ticket.', '/dashboard/tickets');
        setLatest({
          ...notif,
          _id: (notif as NotificationPayload)._id || (notif.data?.ticketId as string) || '',
          link: '/dashboard/tickets',
          isRead: false,
          createdAt: (notif as NotificationPayload).createdAt || new Date().toISOString(),
        } as NotificationPayload);
      } else {
        const title = (notif as NotificationPayload).title || 'Notification';
        const message = (notif as NotificationPayload).message || '';
        showBrowserNotification(title, message, (notif as NotificationPayload).link);
        setLatest(notif as NotificationPayload);
      }
    });

    // Real-time events from backend (new lead, new application, lead assigned)
    socket.on('notification', (payload: { type: string; data?: Record<string, unknown> }) => {
      const { type, data } = payload;
      if (type === 'new_lead' && data) {
        toast.info(`New lead: ${(data.name as string) || data.email}`);
        showBrowserNotification(
          'New lead received',
          `${(data.name as string) || data.email} was added as a lead.`,
          '/dashboard/sales/leads',
        );
      } else if (type === 'lead_assigned' && data) {
        toast.info(`Lead assigned to you: ${(data.name as string) || data.email}`);
        showBrowserNotification(
          'Lead assigned to you',
          `${(data.name as string) || data.email} is now assigned to you.`,
          '/dashboard/sales/leads',
        );
      } else if (type === 'new_application' && data) {
        toast.info(`New application from ${(data.applicantName as string) || data.email}`);
        showBrowserNotification(
          'New application received',
          `${(data.applicantName as string) || data.email} submitted an application.`,
          '/dashboard/hr/recruitment/applications',
        );
      }
    });

    // Poll as fallback every 30 seconds
    const interval = setInterval(fetchCount, 30000);

    return () => {
      clearInterval(interval);
      socket.off('notification:new');
      socket.off('notification');
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
  }, [fetchCount]);

  return { unreadCount, latest, refresh: fetchCount };
}
