'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { COIN_COLORS, DEFAULT_COLOR, COIN_ICONS, COIN_NAMES } from '@/lib/coins';
import { fmtUsd, fmtPrice, fmtCoinAmt } from '@/lib/format';
import BottomNav from '@/components/BottomNav';
import TransactionModal from '@/components/TransactionModal';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [prices, setPrices] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portfolios, setPortfolios] = useState([]);
  const [activePid, setActivePid] = useState(null);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    fetch('/api/portfolios').then(r => r.json()).then(pfs => {
      setPortfolios(pfs);
      const params = new URLSearchParams(window.location.search);
      const pid = params.get('portfolio') || pfs[0]?.id || 'corolla';
      setActivePid(pid);
    });
  }, []);

  useEffect(() => {
    if (!activePid) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/transactions?portfolio=${activePid}`).then(r => r.json()),
      fetch('/api/prices').then(r => r.json()),
      fetch(`/api/config?portfolio=${activePid}`).then(r => r.json()),
    ]).then(([txns, p, c]) => {
      setTransactions(Array.isArray(txns) ? txns : []);
      setPrices(p);
      setConfig(c);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [activePid]);

  function switchPortfolio(pid) {
    setActivePid(pid);
    window.history.replaceState(null, '', `?portfolio=${pid}`);
    setLoading(true);
    Promise.all([
      fetch(`/api/transactions?portfolio=${pid}`).then(r => r.json()),
      fetch(`/api/config?portfolio=${pid}`).then(r => r.json()),
    ]).then(([txns, c]) => {
      setTransactions(Array.isArray(txns) ? txns : []);
      setConfig(c);
      setLoading(false);
    });
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleSave(txnData) {
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...txnData, portfolio: activePid }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`${txnData.type.toUpperCase()} recorded!`);
        setModal(null);
        // Refresh
        const [txns, c] = await Promise.all([
          fetch(`/api/transactions?portfolio=${activePid}`).then(r => r.json()),
          fetch(`/api/config?portfolio=${activePid}`).then(r => r.json()),
        ]);
        setTransactions(txns);
        setConfig(c);
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Failed to save', 'error');
    }
  }

  if (loading || !activePid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="relative">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center animate-float shadow-lg shadow-emerald-500/20">
            <span className="text-white text-xs font-black tracking-tighter">EA</span>
          </div>
          <div className="absolute inset-0 rounded-2xl bg-emerald-500/20 animate-ping" />
        </div>
      </div>
    );
  }

  const activePortfolio = portfolios.find(p => p.id === activePid);
  const assets = config?.assets || [];

  // Build per-coin summaries from transactions
  const coinMap = {};
  for (const t of transactions) {
    if (!coinMap[t.coin]) coinMap[t.coin] = [];
    coinMap[t.coin].push(t);
  }

  // Merge with config assets to show all coins even with 0 transactions
  const coinList = [];
  const seen = new Set();
  for (const asset of assets) {
    const txns = coinMap[asset.symbol] || [];
    seen.add(asset.symbol);
    coinList.push({ asset, txns });
  }
  // Any coins with transactions but not in config
  for (const [sym, txns] of Object.entries(coinMap)) {
    if (!seen.has(sym)) {
      coinList.push({ asset: { symbol: sym, class: 'liquid', weight: 0 }, txns });
    }
  }

  // Portfolio totals
  const totalValue = assets.reduce((s, a) => {
    const p = prices?.[a.symbol];
    if (!p || !a.avgCost || a.avgCost === 0) return s;
    return s + (a.holdingsUsd / a.avgCost) * p;
  }, 0) + (config?.cash || 0);

  const totalCost = assets.reduce((s, a) => s + (a.holdingsUsd || 0), 0);
  const totalPnl = totalValue - totalCost - (config?.cash || 0);
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  return (
    <div className="min-h-screen">
      {/* Toast */}
      {toast && (
        <div role="alert" aria-live="polite" className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg animate-toast ${
          toast.type === 'error'
            ? 'bg-red-500/15 border border-red-500/30 text-red-300'
            : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <TransactionModal
          mode="add"
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Header */}
      <header className="border-b border-zinc-800/30 sticky top-0 z-10 bg-zinc-950/60 backdrop-blur-2xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href={`/?portfolio=${activePid}`} className="hidden sm:flex text-zinc-500 hover:text-zinc-300 transition-colors text-sm items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
              Dashboard
            </Link>
            <div className="w-px h-4 bg-zinc-800/50 hidden sm:block" />
            <h1 className="text-base font-bold tracking-tight">Portfolio</h1>
            {portfolios.length > 1 && (
              <select
                value={activePid}
                onChange={(e) => switchPortfolio(e.target.value)}
                className="bg-zinc-800/50 border border-zinc-700/30 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 cursor-pointer transition-all"
              >
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
          <button
            onClick={() => setModal({ mode: 'add' })}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Add
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-6 space-y-4">
        {/* Portfolio summary */}
        {activePortfolio && (
          <div className="flex items-center justify-between animate-fade-up">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-md border border-emerald-500/20">
                {activePortfolio.name}
              </span>
              <span className="text-[11px] text-zinc-600">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}

        {/* Total balance card */}
        <div className="glass rounded-2xl p-5 sm:p-6 animate-fade-up relative overflow-hidden" style={{ animationDelay: '30ms' }}>
          {/* Decorative blur orbs */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/8 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="relative">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Total Balance</p>
            <p className="text-3xl sm:text-4xl font-mono font-bold mt-1 tabular-nums tracking-tighter">{fmtUsd(totalValue)}</p>
            {totalCost > 0 && (
              <div className="flex items-center gap-3 mt-2.5">
                <span className={`text-sm font-mono font-semibold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}{fmtUsd(totalPnl)}
                </span>
                <span className={`text-xs font-mono px-2.5 py-1 rounded-lg ${
                  totalPnlPct >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Coin rows */}
        <div className="space-y-2.5">
          {coinList.map(({ asset, txns }, idx) => {
            const sym = asset.symbol;
            const colors = COIN_COLORS[sym] || DEFAULT_COLOR;
            const price = prices?.[sym];
            const totalCoins = asset.avgCost > 0 ? (asset.holdingsUsd || 0) / asset.avgCost : 0;
            const currentValue = totalCoins * (price || 0);
            const pnl = currentValue - (asset.holdingsUsd || 0);
            const pnlPct = asset.holdingsUsd > 0 ? (pnl / asset.holdingsUsd) * 100 : 0;

            return (
              <Link
                key={sym}
                href={`/coin/${sym.toLowerCase()}?portfolio=${activePid}`}
                className={`block glass rounded-2xl p-4 hover:ring-1 ${colors.ring} hover:bg-zinc-800/40 transition-all active:scale-[0.98] sm:active:scale-100 animate-fade-up group`}
                style={{ animationDelay: `${60 + idx * 40}ms` }}
              >
                <div className="flex items-center gap-3.5">
                  {/* Coin avatar */}
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg ${colors.glow} shrink-0`}>
                    <span className="text-white text-xs font-bold">{COIN_ICONS[sym] || '?'}</span>
                  </div>

                  {/* Coin info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{sym}</span>
                      <span className="text-[11px] text-zinc-500">{COIN_NAMES[sym] || sym}</span>
                    </div>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-sm font-mono text-zinc-400 tabular-nums">{price ? fmtPrice(price) : '--'}</span>
                      {asset.avgCost > 0 && (
                        <span className={`text-[11px] font-mono font-semibold ${pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Holdings */}
                  <div className="text-right shrink-0">
                    {asset.avgCost > 0 ? (
                      <>
                        <p className="text-sm font-mono font-bold tabular-nums">{fmtUsd(currentValue)}</p>
                        <p className="text-[11px] font-mono text-zinc-500 tabular-nums mt-0.5">
                          {fmtCoinAmt(totalCoins)} {sym}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-600">No position</p>
                    )}
                  </div>

                  {/* Arrow */}
                  <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>

        {coinList.length === 0 && (
          <div className="text-center py-14">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-zinc-800/40 flex items-center justify-center">
              <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <p className="text-zinc-500 text-sm">No assets in this portfolio</p>
            <p className="text-zinc-600 text-xs mt-1">Add a transaction to get started.</p>
          </div>
        )}

        <footer className="text-center text-[11px] text-zinc-600 pt-4 pb-8 hidden sm:block">
          Tap a coin to see details and full transaction history.
        </footer>
      </main>

      <BottomNav active="transactions" portfolioId={activePid} />
    </div>
  );
}
