'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Mail, Search, UserPlus, Trash2, Download, RefreshCw, Users, Sparkles } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { showConfirm } from '@/lib/sweetalert';

interface Subscriber { _id: string; email: string; name?: string; status: string; source: string; country?: string; createdAt: string; }

interface Campaign {
  _id: string;
  name: string;
  subject: string;
  status: 'draft' | 'sending' | 'sent';
  stats?: {
    totalRecipients?: number;
    openCount?: number;
    clickCount?: number;
  };
  createdAt: string;
  sentAt?: string;
}

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  active:       { text: 'var(--success)', bg: 'var(--success-subtle)' },
  unsubscribed: { text: 'var(--text-muted)', bg: 'var(--surface-muted)' },
  bounced:      { text: 'var(--error)', bg: 'var(--error-subtle)' },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03, delayChildren: 0.04 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 280, damping: 24 },
  },
};

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatus]     = useState('active');
  const [countryFilter, setCountry]   = useState('');
  const [total, setTotal]             = useState(0);
  const [stats, setStats]             = useState({ total: 0, active: 0, unsubscribed: 0 });
  const [page, setPage]               = useState(1);
  const [activeTab, setActiveTab]     = useState<'subscribers' | 'campaigns'>('subscribers');

  const [campaigns, setCampaigns]                 = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading]   = useState(false);
  const [sendingIds,   setSendingIds]            = useState<string[]>([]);
  const [creating,     setCreating]              = useState(false);
  const [aiLoading,    setAiLoading]             = useState(false);
  const [campaignForm, setCampaignForm]          = useState({
    name: '',
    subject: '',
    html: '',
    text: '',
    countries: '',
    tags: '',
    statuses: ['active'] as string[],
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      if (countryFilter) params.set('country', countryFilter);
      const [subRes, statsRes] = await Promise.all([
        api.get(`/subscribers?${params}`),
        api.get('/subscribers/stats'),
      ]);
      setSubscribers(subRes.data.data.subscribers || []);
      setTotal(subRes.data.data.pagination?.total || 0);
      setStats(statsRes.data.data);
    } catch { toast.error('Failed to load subscribers'); }
    finally { setLoading(false); }
  }, [page, statusFilter, search, countryFilter]);

  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    try {
      const res = await api.get('/subscribers/campaigns');
      setCampaigns(res.data.data.campaigns || []);
    } catch {
      toast.error('Failed to load campaigns');
    } finally {
      setCampaignsLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchAll, 400);
    return () => clearTimeout(t);
  }, [fetchAll]);

  useEffect(() => {
    if (activeTab === 'campaigns') {
      fetchCampaigns();
    }
  }, [activeTab, fetchCampaigns]);

  const deleteSubscriber = async (id: string) => {
    const result = await showConfirm('Remove subscriber?', 'Remove this subscriber?');
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/subscribers/${id}`);
      setSubscribers(prev => prev.filter(s => s._id !== id));
      toast.success('Subscriber removed');
    } catch { toast.error('Failed'); }
  };

  const exportCSV = () => {
    const header = 'Email,Name,Status,Source,Country,Joined\n';
    const rows = subscribers.map(s =>
      `${s.email},${s.name || ''},${s.status},${s.source},${s.country || ''},${new Date(s.createdAt).toLocaleDateString()}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'subscribers.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported!');
  };

  const allCountries = Array.from(
    new Set(subscribers.map((s) => s.country).filter((c): c is string => !!c && c.trim().length > 0))
  ).sort();

  const handleCreateCampaign = async () => {
    if (!campaignForm.name || !campaignForm.subject || !campaignForm.html) {
      toast.error('Name, subject and HTML are required');
      return;
    }
    setCreating(true);
    try {
      const countries = campaignForm.countries
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);
      const tags = campaignForm.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      await api.post('/subscribers/campaigns', {
        name: campaignForm.name,
        subject: campaignForm.subject,
        html: campaignForm.html,
        text: campaignForm.text || undefined,
        filters: {
          statuses: campaignForm.statuses,
          countries,
          tags,
        },
      });
      toast.success('Campaign created');
      setCampaignForm({
        name: '',
        subject: '',
        html: '',
        text: '',
        countries: '',
        tags: '',
        statuses: ['active'],
      });
      fetchCampaigns();
    } catch (e) {
      toast.error('Failed to create campaign');
    } finally {
      setCreating(false);
    }
  };

  const applyTemplate = (type: 'notice' | 'newsletter' | 'product') => {
    const baseGreeting = '<p>Hi {{name}},</p>';
    let html = '';

    if (type === 'notice') {
      html = `
${baseGreeting}
<h1 style="font-size:20px;margin:16px 0;">Important notice from NowAZone</h1>
<p>We want to let you know about an important update that may impact how you use our services.</p>
<ul>
  <li>Point one of the notice</li>
  <li>Point two of the notice</li>
  <li>Any clear actions the reader must take</li>
</ul>
<p>If you have any questions, just reply to this email.</p>
<p>Best regards,<br/>NowAZone Team</p>
`.trim();
    } else if (type === 'product') {
      html = `
${baseGreeting}
<h1 style="font-size:20px;margin:16px 0;">New feature update</h1>
<p>We have shipped a new improvement that helps you manage your work faster and with more clarity.</p>
<h2 style="font-size:16px;margin-top:16px;">What’s new</h2>
<ul>
  <li>Highlight one major benefit for the user</li>
  <li>Highlight another specific use case</li>
</ul>
<p>Click the button below to explore this update in your dashboard.</p>
<p><a href="{{ctaUrl}}" style="background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;">Open dashboard</a></p>
<p>Thank you for being with NowAZone.</p>
`.trim();
    } else {
      // newsletter
      html = `
${baseGreeting}
<h1 style="font-size:22px;margin:16px 0;">This week's top insights</h1>
<p>Here are a few short updates and highlights curated for you.</p>
<h2 style="font-size:16px;margin-top:16px;">1. Main story headline</h2>
<p>Short summary of the main story you want to share.</p>
<h2 style="font-size:16px;margin-top:16px;">2. Secondary update</h2>
<p>Another useful tip, article, or product update.</p>
<p>Until next time,<br/>NowAZone Team</p>
`.trim();
    }

    setCampaignForm((f) => ({
      ...f,
      html,
    }));
  };

  const handleGenerateWithAI = async () => {
    if (!campaignForm.name && !campaignForm.subject) {
      toast.error('Please fill at least the campaign name or subject before using AI');
      return;
    }
    setAiLoading(true);
    try {
      const briefParts = [
        campaignForm.name && `Campaign name: ${campaignForm.name}`,
        campaignForm.subject && `Subject idea: ${campaignForm.subject}`,
        campaignForm.tags && `Tags: ${campaignForm.tags}`,
        campaignForm.countries && `Target countries: ${campaignForm.countries}`,
      ].filter(Boolean);

      const brief = briefParts.join('\n');

      const res = await api.post('/subscribers/campaigns/ai-generate', {
        brief,
        tone: 'professional but friendly SaaS marketing',
        type: 'general_newsletter',
      });

      const data = res.data?.data;
      if (!data) {
        toast.error('AI response was empty');
        return;
      }

      setCampaignForm((f) => ({
        ...f,
        subject: data.subject || f.subject,
        html: data.html || f.html,
        text: data.text || f.text,
      }));
      toast.success('AI draft generated');
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        'Failed to generate with AI. Check AI server configuration.';
      toast.error(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSendCampaign = async (id: string) => {
    const result = await showConfirm('Send campaign?', 'Send this campaign to matching subscribers?');
    if (!result.isConfirmed) return;
    setSendingIds(prev => [...prev, id]);
    try {
      await api.post(`/subscribers/campaigns/${id}/send`);
      toast.success('Campaign sending queued');
      fetchCampaigns();
    } catch {
      toast.error('Failed to send campaign');
    } finally {
      setSendingIds(prev => prev.filter(x => x !== id));
    }
  };

  const renderOpenRate = (c: Campaign) => {
    const total = c.stats?.totalRecipients || 0;
    const opens = c.stats?.openCount || 0;
    if (!total) return '—';
    const pct = (opens / total) * 100;
    return `${opens}/${total} (${pct.toFixed(1)}%)`;
  };

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
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <motion.div
              className="p-2 rounded-xl"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
              whileHover={{ rotate: [0, -8, 8, 0], scale: 1.08 }}
              transition={{ duration: 0.4 }}
            >
              <Mail size={22} style={{ color: 'var(--accent)' }} />
            </motion.div>
            Email Marketing
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Manage subscribers and run newsletter campaigns with in-app analytics
          </p>
        </div>
        <motion.button
          onClick={exportCSV}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm cursor-pointer"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <Download size={14} /> Export CSV
        </motion.button>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('subscribers')}
          className="px-4 py-2 rounded-full text-sm border cursor-pointer"
          style={{
            backgroundColor: activeTab === 'subscribers' ? 'var(--accent-subtle)' : 'var(--surface)',
            borderColor: activeTab === 'subscribers' ? 'var(--accent)' : 'var(--border)',
            color: activeTab === 'subscribers' ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >
          Subscribers
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className="px-4 py-2 rounded-full text-sm border cursor-pointer"
          style={{
            backgroundColor: activeTab === 'campaigns' ? 'var(--accent-subtle)' : 'var(--surface)',
            borderColor: activeTab === 'campaigns' ? 'var(--accent)' : 'var(--border)',
            color: activeTab === 'campaigns' ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >
          Campaigns
        </button>
      </div>

      {/* Stats */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-3 gap-4 mb-6"
      >
        {[
          { label: 'Total', value: stats.total, accent: 'var(--accent)', bg: 'var(--accent-subtle)', Icon: Users },
          { label: 'Active', value: stats.active, accent: 'var(--success)', bg: 'var(--success-subtle)', Icon: UserPlus },
          { label: 'Unsubscribed', value: stats.unsubscribed, accent: 'var(--text-muted)', bg: 'var(--surface-muted)', Icon: Mail },
        ].map(s => (
          <motion.div key={s.label} variants={fadeUp}
            whileHover={{ scale: 1.03, y: -3, transition: { type: 'spring' as const, stiffness: 400, damping: 18 } }}
            whileTap={{ scale: 0.98 }}
            className="border rounded-xl p-4 transition-shadow cursor-pointer"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <s.Icon size={14} style={{ color: s.accent }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: s.accent }}>{s.value.toLocaleString()}</p>
          </motion.div>
        ))}
      </motion.div>

      {activeTab === 'subscribers' && (
        <>
          {/* Filters */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="flex gap-3 mb-6 flex-wrap"
          >
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subscribers…"
                className="w-full pl-10 pr-4 py-3 border rounded-xl text-sm placeholder-gray-500 focus:outline-none"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatus(e.target.value)}
              className="px-4 py-3 border rounded-xl text-sm focus:outline-none"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="unsubscribed">Unsubscribed</option>
              <option value="bounced">Bounced</option>
            </select>
            <select
              value={countryFilter}
              onChange={e => setCountry(e.target.value)}
              className="px-4 py-3 border rounded-xl text-sm focus:outline-none"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="">All Countries</option>
              {allCountries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </motion.div>

          {/* Table */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="border rounded-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-10 h-10 border-4 border-t-transparent rounded-full"
                  style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading subscribers...</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    <th className="text-left px-6 py-4">Subscriber</th>
                    <th className="text-left px-6 py-4">Status</th>
                    <th className="text-left px-6 py-4">Source</th>
                    <th className="text-left px-6 py-4">Country</th>
                    <th className="text-left px-6 py-4">Joined</th>
                    <th className="text-left px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {subscribers.map(sub => (
                    <motion.tr key={sub._id} whileHover={{ backgroundColor: 'var(--surface-muted)' }} className="transition-colors cursor-pointer">
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold">{sub.email}</p>
                        {sub.name && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub.name}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                          style={{
                            color: STATUS_COLORS[sub.status]?.text ?? 'var(--text-muted)',
                            backgroundColor: STATUS_COLORS[sub.status]?.bg ?? 'var(--surface-muted)',
                          }}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${sub.status === 'active' ? 'animate-pulse' : ''}`}
                            style={{ backgroundColor: STATUS_COLORS[sub.status]?.text ?? 'var(--text-muted)' }}
                          />
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{sub.source}</td>
                      <td className="px-6 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>{sub.country || '—'}</td>
                      <td className="px-6 py-4 text-xs" style={{ color: 'var(--text-muted)' }} suppressHydrationWarning>{new Date(sub.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <motion.button
                          onClick={() => deleteSubscriber(sub._id)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="cursor-pointer"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Trash2 size={14} />
                        </motion.button>
                      </td>
                    </motion.tr>
                  ))}
                  {subscribers.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-16 text-center" style={{ color: 'var(--text-muted)' }}>
                      <Mail size={32} className="mx-auto mb-2 opacity-20" />
                      No subscribers found
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </motion.div>

          {total > 50 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-between mt-4"
            >
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{subscribers.length} of {total}</p>
              <div className="flex gap-2">
                <motion.button
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  whileHover={{ scale: page === 1 ? 1 : 1.03 }}
                  whileTap={{ scale: page === 1 ? 1 : 0.97 }}
                  className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-40 cursor-pointer"
                  style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  Previous
                </motion.button>
                <motion.button
                  onClick={() => setPage(p => p + 1)}
                  disabled={subscribers.length < 50}
                  whileHover={{ scale: subscribers.length < 50 ? 1 : 1.03 }}
                  whileTap={{ scale: subscribers.length < 50 ? 1 : 0.97 }}
                  className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-40 cursor-pointer"
                  style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  Next
                </motion.button>
              </div>
            </motion.div>
          )}
        </>
      )}

      {activeTab === 'campaigns' && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6 mt-2">
          {/* Create campaign */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="border rounded-2xl p-5"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              New Campaign
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Name</label>
                <input
                  value={campaignForm.name}
                  onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  placeholder="March newsletter"
                />
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Subject</label>
                <input
                  value={campaignForm.subject}
                  onChange={e => setCampaignForm(f => ({ ...f, subject: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  placeholder="This week's top insights"
                />
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>HTML content</label>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Quick templates:</span>
                  <button
                    type="button"
                    onClick={() => applyTemplate('newsletter')}
                    className="px-2.5 py-1 rounded-full border text-xs cursor-pointer"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface-muted)' }}
                  >
                    Newsletter
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate('notice')}
                    className="px-2.5 py-1 rounded-full border text-xs cursor-pointer"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface-muted)' }}
                  >
                    Notice / Alert
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate('product')}
                    className="px-2.5 py-1 rounded-full border text-xs cursor-pointer"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface-muted)' }}
                  >
                    Product update
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateWithAI}
                    disabled={aiLoading}
                    className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs cursor-pointer disabled:opacity-60"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)', backgroundColor: 'var(--accent-subtle)' }}
                  >
                    <Sparkles size={12} />
                    {aiLoading ? 'Generating…' : 'Generate with AI'}
                  </button>
                </div>
                <textarea
                  value={campaignForm.html}
                  onChange={e => setCampaignForm(f => ({ ...f, html: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm min-h-[160px]"
                  style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)', fontFamily: 'monospace' }}
                  placeholder="<h1>Hi {{name}}</h1>..."
                />
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Plain text (optional)</label>
                <textarea
                  value={campaignForm.text}
                  onChange={e => setCampaignForm(f => ({ ...f, text: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm min-h-[60px]"
                  style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Countries (comma separated)</label>
                  <input
                    value={campaignForm.countries}
                    onChange={e => setCampaignForm(f => ({ ...f, countries: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="India, UAE"
                  />
                </div>
                <div>
                  <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Tags (comma separated)</label>
                  <input
                    value={campaignForm.tags}
                    onChange={e => setCampaignForm(f => ({ ...f, tags: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="seo, crm"
                  />
                </div>
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Statuses</label>
                <div className="flex flex-wrap gap-2">
                  {['active', 'unsubscribed', 'bounced'].map((s) => {
                    const selected = campaignForm.statuses.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setCampaignForm(f => {
                            const exists = f.statuses.includes(s);
                            return {
                              ...f,
                              statuses: exists
                                ? f.statuses.filter(x => x !== s)
                                : [...f.statuses, s],
                            };
                          })
                        }
                        className="px-3 py-1.5 rounded-full text-xs border cursor-pointer"
                        style={{
                          backgroundColor: selected ? 'var(--accent-subtle)' : 'var(--surface-muted)',
                          borderColor: selected ? 'var(--accent)' : 'var(--border)',
                          color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Subscribers must also match these statuses (default: active only).
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={handleCreateCampaign}
                  disabled={creating}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-60"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
                >
                  {creating ? 'Creating...' : 'Create campaign'}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Campaign list */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="border rounded-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Campaigns</h2>
              <button
                onClick={fetchCampaigns}
                className="flex items-center gap-1 text-xs cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
            {campaignsLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-8 h-8 border-4 border-t-transparent rounded-full"
                  style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading campaigns...</p>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                No campaigns yet. Create your first newsletter on the left.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    <th className="text-left px-6 py-3">Name</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Recipients</th>
                    <th className="text-left px-4 py-3">Open rate</th>
                    <th className="text-left px-4 py-3">Created</th>
                    <th className="text-left px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {campaigns.map(c => (
                    <tr key={c._id} className="hover:bg-[var(--surface-muted)] transition-colors">
                      <td className="px-6 py-3">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.subject}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span
                          className="inline-flex px-2.5 py-1 rounded-full capitalize"
                          style={{
                            backgroundColor:
                              c.status === 'sent'
                                ? 'var(--success-subtle)'
                                : c.status === 'sending'
                                  ? 'var(--accent-subtle)'
                                  : 'var(--surface-muted)',
                            color:
                              c.status === 'sent'
                                ? 'var(--success)'
                                : c.status === 'sending'
                                  ? 'var(--accent)'
                                  : 'var(--text-muted)',
                          }}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {c.stats?.totalRecipients ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {renderOpenRate(c)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.status === 'draft' && (
                          <button
                            onClick={() => handleSendCampaign(c._id)}
                            disabled={sendingIds.includes(c._id)}
                            className="px-3 py-1.5 text-xs rounded-lg border cursor-pointer disabled:opacity-60"
                            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                          >
                            {sendingIds.includes(c._id) ? 'Sending…' : 'Send'}
                          </button>
                        )}
                        {c.status !== 'draft' && c.stats?.totalRecipients ? (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Sent to {c.stats.totalRecipients}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
