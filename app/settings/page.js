'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { coinBadge } from '@/lib/coins';
import BottomNav from '@/components/BottomNav';

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
  const [activePid, setActivePid] = useState(null);
  const [activePortfolio, setActivePortfolio] = useState(null);
  const [pfSaving, setPfSaving] = useState(false);

  useEffect(() => {
    fetch('/api/portfolios').then(r => r.json()).then(pfs => {
      setPortfolios(pfs);
      const params = new URLSearchParams(window.location.search);
      const pid = params.get('portfolio') || pfs[0]?.id || 'corolla';
      setActivePid(pid);
      setActivePortfolio(pfs.find(p => p.id === pid) || pfs[0]);
    });
  }, []);

  useEffect(() => {
    if (!activePid) return;
    setLoading(true);
    fetch(`/api/config?portfolio=${activePid}`)
      .then((r) => r.json())
      .then((c) => { setConfig(c); setLoading(false); })
      .catch(() => setLoading(false));
    const pf = portfolios.find(p => p.id === activePid);
    if (pf) setActivePortfolio(pf);
  }, [activePid, portfolios]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/config?portfolio=${activePid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) showToast('Settings saved');
      else showToast('Save failed', 'error');
    } catch {
      showToast('Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePortfolio() {
    setPfSaving(true);
    try {
      const res = await fetch('/api/portfolios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activePortfolio),
      });
      if (res.ok) {
        showToast('Portfolio settings saved');
        setPortfolios(prev => prev.map(p => p.id === activePortfolio.id ? activePortfolio : p));
      } else showToast('Save failed', 'error');
    } catch {
      showToast('Save failed', 'error');
    } finally {
      setPfSaving(false);
    }
  }

  async function handleTestTelegram() {
    setTestResult('Sending...');
    try {
      const res = await fetch('/api/test-telegram', { method: 'POST' });
      const data = await res.json();
      setTestResult(data.ok ? 'Message sent!' : `Failed: ${data.error}`);
    } catch (e) {
      setTestResult('Error: ' + e.message);
    }
  }

  function switchPortfolio(pid) {
    setActivePid(pid);
    window.history.replaceState(null, '', `?portfolio=${pid}`);
  }

  function update(path, value) {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  }

  if (loading || !activePid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-9 h-9 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Toast */}
      {toast && (
        <div
          role="alert" aria-live="polite"
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg animate-toast ${
            toast.type === 'error'
              ? 'bg-red-500/15 border border-red-500/30 text-red-300'
              : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-800/40 sticky top-0 z-10 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/" className="hidden sm:flex text-zinc-500 hover:text-zinc-300 transition-colors text-sm items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
              Dashboard
            </Link>
            <div className="w-px h-4 bg-zinc-800 hidden sm:block" />
            <h1 className="text-base font-bold">Settings</h1>
            {portfolios.length > 1 && (
              <select
                value={activePid}
                onChange={(e) => switchPortfolio(e.target.value)}
                className="bg-zinc-800/80 border border-zinc-700/40 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-emerald-500/50 cursor-pointer transition-colors"
              >
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-6 space-y-5">
        {/* Portfolio Alert Settings */}
        {activePortfolio && (
          <Section title="Portfolio Alert Channels" delay={0}>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Portfolio Name</label>
                <input
                  type="text"
                  value={activePortfolio.name}
                  onChange={(e) => setActivePortfolio(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Telegram Chat ID</label>
                <input
                  type="text"
                  value={activePortfolio.telegramChatId || ''}
                  onChange={(e) => setActivePortfolio(prev => ({ ...prev, telegramChatId: e.target.value }))}
                  className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-zinc-600 transition-colors"
                  placeholder="687179551"
                />
                <p className="text-[10px] text-zinc-600 mt-1">Comma-separate for multiple recipients</p>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Alert Email</label>
                <input
                  type="email"
                  value={activePortfolio.alertEmail || ''}
                  onChange={(e) => setActivePortfolio(prev => ({ ...prev, alertEmail: e.target.value }))}
                  className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-600 transition-colors"
                  placeholder="you@example.com"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={handleSavePortfolio}
                  disabled={pfSaving}
                  className="px-4 py-2 bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/40 rounded-xl text-sm font-medium transition-all disabled:opacity-50 cursor-pointer"
                >
                  {pfSaving ? 'Saving...' : 'Save Portfolio Settings'}
                </button>
                <button
                  onClick={handleTestTelegram}
                  className="px-4 py-2 bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/40 rounded-xl text-sm font-medium transition-all cursor-pointer"
                >
                  Test Telegram
                </button>
                {testResult && (
                  <span className={`text-xs ${testResult.includes('sent') ? 'text-emerald-400' : 'text-zinc-400'}`}>{testResult}</span>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* Portfolio Capital */}
        <Section title="Portfolio Capital" delay={50}>
          <Field label="Total Capital" value={config?.totalCapital} onChange={(v) => update('totalCapital', Number(v))} prefix="$" />
          <Field label="Per Coin Cap" value={config?.perCoinCap} onChange={(v) => update('perCoinCap', Number(v))} prefix="$" />
          <Field label="Powder Remaining" value={config?.powderRemaining} onChange={(v) => update('powderRemaining', Number(v))} prefix="$" hint="Cash available for new buy rungs" />
          <Field label="Reserve Remaining" value={config?.reserveRemaining} onChange={(v) => update('reserveRemaining', Number(v))} prefix="$" hint="Deep-crash reserve (unlocked on floor confirmation)" />
        </Section>

        {/* Rule Parameters */}
        <Section title="Rule Parameters" delay={100}>
          <Field
            label="Buy Band"
            value={config?.buyBandPct != null ? (config.buyBandPct * 100).toFixed(0) : ''}
            onChange={(v) => update('buyBandPct', Number(v) / 100)}
            suffix="%"
            hint="Alert when price drops this % below buy reference"
          />
          <Field
            label="First Sell Trigger"
            value={config?.firstSellPct != null ? (config.firstSellPct * 100).toFixed(0) : ''}
            onChange={(v) => update('firstSellPct', Number(v) / 100)}
            suffix="%"
            hint="First trim when price rises this % above avg cost"
          />
          <Field
            label="Sell Step"
            value={config?.sellStepPct != null ? (config.sellStepPct * 100).toFixed(0) : ''}
            onChange={(v) => update('sellStepPct', Number(v) / 100)}
            suffix="%"
            hint="Each subsequent sell trigger step"
          />
          <Field
            label="Upside Break"
            value={config?.upsideBreakUsd}
            onChange={(v) => update('upsideBreakUsd', Number(v))}
            prefix="$"
            hint="BTC weekly close above this triggers upside break alert"
          />
        </Section>

        {/* Coins */}
        {Object.entries(config?.coins || {}).map(([coin, cc], idx) => (
          <Section key={coin} title={coin} badge={coin} delay={150 + idx * 40}>
            <Field label="Holdings" value={cc.holdingsUsd} onChange={(v) => update(`coins.${coin}.holdingsUsd`, Number(v))} prefix="$" />
            <Field label="Avg Cost" value={cc.avgCost} onChange={(v) => update(`coins.${coin}.avgCost`, Number(v))} prefix="$" hint="Your average entry price" />
            <Field label="Buy Reference" value={cc.buyReference} onChange={(v) => update(`coins.${coin}.buyReference`, Number(v))} prefix="$" hint="Lower this to your fill price after each buy" />
          </Section>
        ))}

        {/* How-to */}
        <Section title="How to Update After a Trade" delay={300}>
          <div className="text-sm text-zinc-400 space-y-3 leading-relaxed">
            <p>
              <strong className="text-zinc-200">After a BUY fills:</strong> Lower
              the coin&apos;s <em className="text-zinc-300">Buy Reference</em> to the fill price. Reduce{' '}
              <em className="text-zinc-300">Powder Remaining</em> by the amount deployed. Update{' '}
              <em className="text-zinc-300">Holdings</em> and <em className="text-zinc-300">Avg Cost</em>.
            </p>
            <p>
              <strong className="text-zinc-200">After a SELL fills:</strong>{' '}
              Update <em className="text-zinc-300">Holdings</em> to reflect the trimmed position.
            </p>
            <p className="text-emerald-400/80">
              <strong className="text-emerald-400">Or just use Transactions:</strong>{' '}
              Log buys and sells in the Transactions page &mdash; everything is calculated automatically.
            </p>
          </div>
        </Section>

        <footer className="text-center text-[11px] text-zinc-700 pt-4 pb-8 hidden sm:block">
          Changes are saved per portfolio. The cron job reads your latest config each run.
        </footer>
      </main>

      <BottomNav active="settings" portfolioId={activePid} />
    </div>
  );
}

/* ---------- Components ---------- */


function Section({ title, badge, children, delay = 0 }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-2xl p-5 animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2 mb-4">
        {badge && (
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${coinBadge(badge)}`}>
            {badge}
          </span>
        )}
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          {title}
        </h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'number', prefix, suffix, hint }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm text-zinc-300 whitespace-nowrap">{label}</label>
        <div className="flex items-center gap-1.5">
          {prefix && <span className="text-sm text-zinc-500">{prefix}</span>}
          <input
            type={type}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-36 sm:w-44 bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2 text-sm font-mono text-right
              focus:outline-none focus:border-zinc-600 transition-colors
              placeholder:text-zinc-700 tabular-nums"
          />
          {suffix && <span className="text-sm text-zinc-500">{suffix}</span>}
        </div>
      </div>
      {hint && <p className="text-[10px] text-zinc-600 mt-1 text-right">{hint}</p>}
    </div>
  );
}
