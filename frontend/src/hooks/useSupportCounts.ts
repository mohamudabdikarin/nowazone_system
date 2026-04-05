'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { connectSocket } from '@/lib/socket';
import api from '@/lib/api';

const TICKETS_LAST_VISITED_KEY = 'support_tickets_last_visited';

export function useSupportCounts() {
  const pathname = usePathname();
  const [ticketsCount, setTicketsCount] = useState<number>(0);

  const fetchCounts = useCallback(async () => {
    try {
      if (typeof window === 'undefined') return;
      let ticketsSince = localStorage.getItem(TICKETS_LAST_VISITED_KEY);
      if (!ticketsSince) {
        ticketsSince = String(Date.now());
        localStorage.setItem(TICKETS_LAST_VISITED_KEY, ticketsSince);
      }
      const ticketsRes = await api.get<{ data: { pagination?: { total?: number } } }>(
        `/tickets?limit=1&updatedAfter=${ticketsSince}`
      );
      setTicketsCount(ticketsRes.data?.data?.pagination?.total ?? 0);
    } catch {
      // Silent; user may lack permission
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pathname === '/dashboard/tickets') {
      localStorage.setItem(TICKETS_LAST_VISITED_KEY, String(Date.now()));
      setTicketsCount(0);
    }
  }, [pathname]);

  useEffect(() => {
    fetchCounts();
    const socket = connectSocket();
    const handler = () => fetchCounts();
    socket.on('notification:new', handler);
    return () => {
      socket.off('notification:new', handler);
    };
  }, [fetchCounts]);

  return { ticketsCount, refresh: fetchCounts };
}
