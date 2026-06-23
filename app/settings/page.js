'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { coinBadge } from '@/lib/coins';
import BottomNav from '@/components/BottomNav';
import { STRATEGY_CONFIG } from '@/lib/defaults';

const FILL_JUMP_PCT = STRATEGY_CONFIG.safetyGuards.fillJumpWarningPct;
const AVG_COST_VS_PRICE_PCT = STRATEGY_CONFIG.safetyGuards.avgCostVsPriceWarningPct;

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [savedConfig, setSavedConfig] = useState(null); // snapshot for diff
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
  const [activePid, setActivePid] = useState(null);
  const [activePortfolio, setActivePortfolio] = useState(null);
  const [pfSaving, setPfSaving] = useState(false);
  const [prices, setPrices] = useState({});
  const [confirm, setConfirm] = useState(null); // { changes, warnings }

  useEffect(() => {
    fetch('/api/portfolios').then(r => r.json()).then(pfs => {
      setPortfolios(pfs);
      const params = new URLSearchParams(window.location.search);
      const pid = params.get('portfolio') || pfs[0]?.id || 'corolla';
      setActivePid(pid);
      setActivePortfolio(pfs.find(p => p.id === pid) || pfs[0]);
    });
    // Fetch live prices for avg-cost comparison
    fetch('/api/status').then(r => r.json()).then(d => {
      if (d.prices) setPrices(d.prices);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activePid) return;
    setLoading(true);
    fetch(`/api/config?portfolio=${activePid}`)
      .then((r) => r.json())
      .then((c) => {
        setConfig(c);
        setSavedConfig(JSON.parse(JSON.stringify(c)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
    const pf = portfolios.find(p => p.id === activePid);
    if (pf) setActivePortfolio(pf);
  }, [activePid, portfolios]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  // ── Fill-confirmation logic ──
  function computeChanges() {
    if (!config || !savedConfig) return { changes: [], warnings: [] };
    const changes = [];
    const warnings = [];

    // Capital / cash changes
    if (config.capital !== savedConfig.capital) {
      changes.push(`Capital: $${savedConfig.capital} → $${config.capital}`);
    }
    if (config.cash !== savedConfig.cash) {
      changes.push(`Cash: $${savedConfig.cash} → $${config.cash}`);
    }

    // Per-asset changes
    const savedAssets = savedConfig.assets || [];
    const newAssets = config.assets || [];
    for (let i = 0; i < newAssets.length; i++) {
      const prev = savedAssets[i] || {};
      const next = newAssets[i];
      const sym = next.symbol;

      // Holdings change
      if (next.holdingsUsd !== prev.holdingsUsd) {
        const pct = prev.holdingsUsd > 0
          ? ((next.holdingsUsd - prev.holdingsUsd) / prev.holdingsUsd * 100).toFixed(1)
          : 'new';
        changes.push(`${sym} Holdings: $${prev.holdingsUsd || 0} → $${next.holdingsUsd} (${pct}%)`);
        if (prev.holdingsUsd > 0 && Math.abs(next.holdingsUsd - prev.holdingsUsd) / prev.holdingsUsd > FILL_JUMP_PCT) {
          warnings.push(`${sym} holdings changed by ${pct}% — that's more than ${(FILL_JUMP_PCT * 100).toFixed(0)}%. Double-check this is correct.`);
        }
      }

      // Avg cost change
      if (next.avgCost !== prev.avgCost) {
        const pct = prev.avgCost > 0
          ? ((next.avgCost - prev.avgCost) / prev.avgCost * 100).toFixed(1)
          : 'new';
        changes.push(`${sym} Avg Cost: $${prev.avgCost || 0} → $${next.avgCost} (${pct}%)`);
        if (prev.avgCost > 0 && Math.abs(next.avgCost - prev.avgCost) / prev.avgCost > FILL_JUMP_PCT) {
          warnings.push(`${sym} avg cost changed by ${pct}% — that's more than ${(FILL_JUMP_PCT * 100).toFixed(0)}%. Double-check this is correct.`);
        }
        // Check avg cost vs live price
        const livePrice = prices[sym];
        if (livePrice && next.avgCost > 0) {
          const drift = Math.abs(next.avgCost - livePrice) / livePrice;
          if (drift > AVG_COST_VS_PRICE_PCT) {
            warnings.push(`${sym} avg cost ($${next.avgCost}) is ${(drift * 100).toFixed(0)}% off the live price ($${livePrice.toLocaleString()}) — this looks unusual, double-check.`);
          }
        }
      }

      // Last action price change
      if (next.lastActionPrice !== prev.lastActionPrice) {
        changes.push(`${sym} Last Action Price: $${prev.lastActionPrice || 0} → $${next.lastActionPrice}`);
      }

      // Weight change
      if (next.weight !== prev.weight) {
        changes.push(`${sym} Weight: ${((prev.weight || 0) * 100).toFixed(0)}% → ${((next.weight || 0) * 100).toFixed(0)}%`);
      }
    }

    return { changes, warnings };
  }

  // Check if portfolio-level fields (name, telegramChatId, email) changed
  function hasPortfolioChanges() {
    if (!activePortfolio) return false;
    const original = portfolios.find(p => p.id === activePortfolio.id);
    if (!original) return false;
    return original.name !== activePortfolio.name
      || (original.telegramChatId || '') !== (activePortfolio.telegramChatId || '')
      || (original.alertEmail || '') !== (activePortfolio.alertEmail || '')
      || (original.stablecoin || '') !== (activePortfolio.stablecoin || '');
  }

  function handleSaveClick() {
    const { changes, warnings } = computeChanges();
    const pfChanged = hasPortfolioChanges();
    if (changes.length === 0 && !pfChanged) {
      showToast('No changes to save');
      return;
    }
    if (pfChanged) {
      if (!changes.includes('[Portfolio settings updated]')) {
        changes.push('[Portfolio settings updated]');
      }
    }
    // Always show confirmation dialog
    setConfirm({ changes, warnings });
  }

  async function handleConfirmSave() {
    setConfirm(null);
    setSaving(true);
    try {
      const configRes = await fetch(`/api/config?portfolio=${activePid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      // Also save portfolio settings if they changed
      if (hasPortfolioChanges()) {
        const pfRes = await fetch('/api/portfolios', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(activePortfolio),
        });
        if (pfRes.ok) {
          setPortfolios(prev => prev.map(p => p.id === activePortfolio.id ? activePortfolio : p));
        }
      }
      if (configRes.ok) {
        showToast('Settings saved');
        setSavedConfig(JSON.parse(JSON.stringify(config)));
      } else showToast('Save failed', 'error');
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

      {/* Confirmation Dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-sm font-bold text-zinc-200 mb-3">Confirm Changes</h3>
            <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto">
              {confirm.changes.map((c, i) => (
                <p key={i} className="text-xs text-zinc-400 font-mono">{c}</p>
              ))}
            </div>
            {confirm.warnings.length > 0 && (
              <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <p className="text-xs font-semibold text-amber-400 mb-1.5">Unusual changes detected:</p>
                {confirm.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-300/80 mb-1">{w}</p>
                ))}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/40 rounded-xl text-sm font-medium transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSave}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
              >
                {confirm.warnings.length > 0 ? 'Save Anyway' : 'Confirm Save'}
              </button>
            </div>
          </div>
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
            onClick={handleSaveClick}
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
          <Field label="Capital" value={config?.capital} onChange={(v) => update('capital', Number(v))} prefix="$" hint="Total capital allocated — all weights are % of this" />
          <Field label="Cash" value={config?.cash} onChange={(v) => update('cash', Number(v))} prefix="$" hint="Cash in portfolio — 10% kept as dry-powder floor" />
        </Section>

        {/* Assets */}
        {(config?.assets || []).map((asset, idx) => (
          <Section key={asset.symbol} title={asset.symbol} badge={asset.symbol} delay={150 + idx * 40}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-md border ${asset.class === 'liquid' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border-purple-500/20'}`} title={asset.class === 'liquid' ? 'Traded on major exchanges with reliable volume. Standard buy/sell rules apply.' : 'Small-cap token with special safeguards: slippage limits, volume checks, and cooldown periods.'}>{asset.class}</span>
            </div>
            <Field
              label="Weight"
              value={asset.weight != null ? (asset.weight * 100).toFixed(0) : ''}
              onChange={(v) => update(`assets.${idx}.weight`, Number(v) / 100)}
              suffix="%"
              hint="Target allocation as % of total capital"
            />
            <Field label="Cost Basis (USD)" value={asset.holdingsUsd} onChange={(v) => update(`assets.${idx}.holdingsUsd`, Number(v))} prefix="$" hint="Total amount invested in this position" />
            <Field label="Avg Cost" value={asset.avgCost} onChange={(v) => update(`assets.${idx}.avgCost`, Number(v))} prefix="$" hint="Your average entry price" />
            <Field label="Last Trade Price" value={asset.lastActionPrice} onChange={(v) => update(`assets.${idx}.lastActionPrice`, Number(v))} prefix="$" hint="Price at your last buy or sell. Take-profit alert fires when price rises 20% above this." />
          </Section>
        ))}

        {/* How-to */}
        <Section title="How to Update After a Trade" delay={300}>
          <div className="text-sm text-zinc-400 space-y-3 leading-relaxed">
            <p>
              <strong className="text-zinc-200">After a BUY fills:</strong> Update the
              asset&apos;s <em className="text-zinc-300">Holdings</em> and <em className="text-zinc-300">Avg Cost</em>.
              Set <em className="text-zinc-300">Last Action Price</em> to your fill price.
              Reduce <em className="text-zinc-300">Cash</em> by the amount spent.
            </p>
            <p>
              <strong className="text-zinc-200">After a SELL fills:</strong> Reduce{' '}
              <em className="text-zinc-300">Holdings</em> to reflect the trimmed position.
              Set <em className="text-zinc-300">Last Action Price</em> to your sell price.
              Increase <em className="text-zinc-300">Cash</em> by the proceeds.
            </p>
            <p className="text-emerald-400/80">
              <strong className="text-emerald-400">Or just use Transactions:</strong>{' '}
              Log buys and sells in the Transactions page &mdash; everything is calculated automatically.
            </p>
            <p className="text-amber-400/60 text-xs mt-2">
              All changes require confirmation before saving. Changes over {(FILL_JUMP_PCT * 100).toFixed(0)}% are flagged for review.
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
  const [editing, setEditing] = useState(false);
  // Display rounded value when not editing; show full precision when focused
  const displayValue = (!editing && type === 'number' && value != null && value !== '')
    ? parseFloat(Number(value).toFixed(2))
    : value;
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm text-zinc-300 whitespace-nowrap">{label}</label>
        <div className="flex items-center gap-1.5">
          {prefix && <span className="text-sm text-zinc-500">{prefix}</span>}
          <input
            type={type}
            value={displayValue ?? ''}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
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
