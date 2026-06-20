'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { COIN_COLORS, DEFAULT_COLOR, COIN_ICONS, COIN_NAMES } from '@/lib/coins';
import { fmtUsd, fmtPrice, fmtCoinAmt } from '@/lib/format';
import BottomNav from '@/components/BottomNav';
import TransactionModal from '@/components/TransactionModal';

export default function CoinDetail() {
  const { symbol } = useParams();
  const searchParams = useSearchParams();
  const coin = symbol?.toUpperCase();
  const colors = COIN_COLORS[coin] || DEFAULT_COLOR;

  const [prices, setPrices] = useState(null);
  const [config, setConfig] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [portfolios, setPortfolios] = useState([]);
  const [activePid, setActivePid] = useState(null);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', index, txn }

  useEffect(() => {
    fetch('/api/portfolios').then(r => r.json()).then(pfs => {
      setPortfolios(pfs);
      const pid = searchParams.get('portfolio') || pfs[0]?.id || 'corolla';
      setActivePid(pid);
    });
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    if (!activePid || !coin) return;
    try {
      const [pRes, cRes, tRes] = await Promise.all([
        fetch('/api/prices'),
        fetch(`/api/config?portfolio=${activePid}`),
        fetch(`/api/transactions?portfolio=${activePid}&coin=${coin}`),
      ]);
      setPrices(await pRes.json());
      setConfig(await cRes.json());
      setTransactions(await tRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activePid, coin]);

  useEffect(() => {
    if (!activePid) return;
    setLoading(true);
    fetchData();
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, [fetchData, activePid]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  function switchPortfolio(pid) {
    setActivePid(pid);
    window.history.replaceState(null, '', `?portfolio=${pid}`);
  }

  async function handleSave(txnData) {
    try {
      const isEdit = modal?.mode === 'edit';
      const res = await fetch('/api/transactions', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...txnData,
          portfolio: activePid,
          ...(isEdit ? { index: modal.index } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(isEdit ? 'Transaction updated!' : `${txnData.type.toUpperCase()} recorded!`);
        setModal(null);
        fetchData();
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Failed to save', 'error');
    }
  }

  async function handleDelete(index) {
    if (!confirm('Delete this transaction? Portfolio will be recalculated.')) return;
    try {
      const res = await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, portfolio: activePid }),
      });
      if (res.ok) {
        showToast('Deleted. Portfolio recalculated.');
        fetchData();
      }
    } catch {
      showToast('Delete failed', 'error');
    }
  }

  if (loading || !activePid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="relative">
          <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center animate-float shadow-lg ${colors.glow}`}>
            <span className="text-white text-sm font-bold">{COIN_ICONS[coin] || '?'}</span>
          </div>
          <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${colors.gradient} opacity-20 animate-ping`} />
        </div>
      </div>
    );
  }

  const asset = config?.assets?.find(a => a.symbol === coin);
  const price = prices?.[coin];
  const totalCoins = asset?.avgCost > 0 ? asset.holdingsUsd / asset.avgCost : 0;
  const currentValue = totalCoins * (price || 0);
  const totalCost = asset?.holdingsUsd || 0;
  const pnl = currentValue - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

  // Transaction summaries
  const buys = transactions.filter(t => t.type === 'buy');
  const sells = transactions.filter(t => t.type === 'sell');
  const totalBought = buys.reduce((s, t) => s + t.amount, 0);
  const totalSold = sells.reduce((s, t) => s + t.amount, 0);
  const totalSpent = buys.reduce((s, t) => s + t.amount * t.pricePerCoin, 0);
  const totalReceived = sells.reduce((s, t) => s + t.amount * t.pricePerCoin, 0);

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
          mode={modal.mode}
          coin={coin}
          initialData={modal.mode === 'edit' ? modal.txn : undefined}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Header */}
      <header className="border-b border-zinc-800/30 sticky top-0 z-10 bg-zinc-950/60 backdrop-blur-2xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href={`/transactions?portfolio=${activePid}`} className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
              <span className="hidden sm:inline">Back</span>
            </Link>
            <div className="w-px h-4 bg-zinc-800/50" />
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-md ${colors.glow}`}>
              <span className="text-white text-[10px] font-bold">{COIN_ICONS[coin] || '?'}</span>
            </div>
            <h1 className="text-base font-bold tracking-tight">{COIN_NAMES[coin] || coin}</h1>
          </div>
          <div className="flex items-center gap-2">
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
            <button
              onClick={() => setModal({ mode: 'add' })}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
              Add
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-6 space-y-4">
        {/* Price Header */}
        <div className="glass rounded-2xl p-5 sm:p-6 animate-fade-up relative overflow-hidden">
          {/* Decorative blur orbs */}
          <div className={`absolute -top-16 -right-16 w-40 h-40 bg-gradient-to-br ${colors.gradient} opacity-[0.06] rounded-full blur-2xl pointer-events-none`} />
          <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg ${colors.glow}`}>
                  <span className="text-white text-sm font-bold">{COIN_ICONS[coin] || '?'}</span>
                </div>
                <div>
                  <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">{COIN_NAMES[coin] || coin} Price</p>
                  <p className="text-3xl sm:text-4xl font-mono font-bold mt-0.5 tabular-nums tracking-tighter">
                    {price ? fmtPrice(price) : '--'}
                  </p>
                </div>
              </div>
              {asset?.avgCost > 0 && (
                <span className={`text-sm font-mono font-semibold px-3 py-1.5 rounded-xl border ${
                  pnlPct >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                </span>
              )}
            </div>

            {/* Holdings Card */}
            {asset?.avgCost > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-zinc-700/20 pt-4">
                <div className="bg-zinc-800/20 rounded-xl p-3">
                  <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Holdings</p>
                  <p className="text-sm sm:text-base font-mono font-bold mt-1 tabular-nums">{fmtCoinAmt(totalCoins)} <span className="text-zinc-500 text-[10px]">{coin}</span></p>
                </div>
                <div className="bg-zinc-800/20 rounded-xl p-3">
                  <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Current Value</p>
                  <p className="text-sm sm:text-base font-mono font-bold mt-1 tabular-nums">{fmtUsd(currentValue)}</p>
                </div>
                <div className="bg-zinc-800/20 rounded-xl p-3">
                  <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Total Cost</p>
                  <p className="text-sm sm:text-base font-mono font-bold text-zinc-400 mt-1 tabular-nums">{fmtUsd(totalCost)}</p>
                </div>
                <div className="bg-zinc-800/20 rounded-xl p-3">
                  <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Profit / Loss</p>
                  <p className={`text-sm sm:text-base font-mono font-bold mt-1 tabular-nums ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pnl >= 0 ? '+' : ''}{fmtUsd(pnl)}
                  </p>
                </div>
                <div className="bg-zinc-800/20 rounded-xl p-3">
                  <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Avg Net Cost</p>
                  <p className="text-sm font-mono font-bold text-zinc-400 mt-1 tabular-nums">{fmtPrice(asset.avgCost)}</p>
                </div>
                <div className="bg-zinc-800/20 rounded-xl p-3">
                  <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Total Bought</p>
                  <p className="text-sm font-mono font-bold text-zinc-400 mt-1 tabular-nums">{fmtCoinAmt(totalBought)} <span className="text-zinc-600 text-[10px]">({fmtUsd(totalSpent)})</span></p>
                </div>
                {totalSold > 0 && (
                  <div className="bg-zinc-800/20 rounded-xl p-3">
                    <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Total Sold</p>
                    <p className="text-sm font-mono font-bold text-zinc-400 mt-1 tabular-nums">{fmtCoinAmt(totalSold)} <span className="text-zinc-600 text-[10px]">({fmtUsd(totalReceived)})</span></p>
                  </div>
                )}
                {asset.lastActionPrice > 0 && (
                  <div className="bg-zinc-800/20 rounded-xl p-3">
                    <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Last Action Price</p>
                    <p className="text-sm font-mono font-bold text-zinc-400 mt-1 tabular-nums">{fmtPrice(asset.lastActionPrice)}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="border-t border-zinc-700/20 pt-4">
                <p className="text-sm text-zinc-500">No position held. Add a transaction to start tracking.</p>
              </div>
            )}
          </div>
        </div>

        {/* Transaction History */}
        <div className="glass rounded-2xl p-5 animate-fade-up" style={{ animationDelay: '50ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Transactions <span className="text-zinc-600 normal-case font-normal ml-1">({transactions.length})</span>
            </h2>
            <button
              onClick={() => setModal({ mode: 'add' })}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold transition-colors cursor-pointer"
            >
              + Add transaction
            </button>
          </div>

          {transactions.length === 0 ? (
            <div className="text-center py-12">
              <div className={`w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br ${colors.gradient} opacity-20 flex items-center justify-center`}>
                <span className="text-white text-sm font-bold opacity-60">{COIN_ICONS[coin] || '?'}</span>
              </div>
              <p className="text-zinc-500 text-sm">No transactions for {coin}</p>
              <p className="text-zinc-600 text-xs mt-1">Add your first buy or sell above.</p>
            </div>
          ) : (
            <TransactionList
              transactions={transactions}
              coin={coin}
              activePid={activePid}
              onEdit={(idx, txn) => setModal({ mode: 'edit', index: idx, txn })}
              onDelete={handleDelete}
            />
          )}
        </div>
      </main>

      <BottomNav active="transactions" portfolioId={activePid} />
    </div>
  );
}

function TransactionList({ transactions, coin, activePid, onEdit, onDelete }) {
  // We need real indices from the full transaction list for edit/delete
  // Since GET ?coin= filters, we need to fetch the full list to know real indices
  const [realIndices, setRealIndices] = useState([]);

  useEffect(() => {
    fetch(`/api/transactions?portfolio=${activePid}`)
      .then(r => r.json())
      .then(allTxns => {
        const indices = [];
        for (let i = 0; i < allTxns.length; i++) {
          if (allTxns[i].coin === coin) indices.push(i);
        }
        setRealIndices(indices);
      });
  }, [activePid, coin, transactions.length]);

  // Sort reverse chronological
  const sorted = transactions.map((t, i) => ({ ...t, localIdx: i })).reverse();

  return (
    <div className="space-y-2">
      {sorted.map((t) => {
        const realIdx = realIndices[t.localIdx];
        const total = t.amount * t.pricePerCoin;
        return (
          <div key={t.localIdx} className="flex items-center gap-3 bg-zinc-800/20 hover:bg-zinc-800/35 rounded-xl px-4 py-3.5 transition-all group border border-transparent hover:border-zinc-700/20">
            <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg shrink-0 ${
              t.type === 'buy'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {t.type}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono text-zinc-200 tabular-nums">
                {fmtCoinAmt(t.amount)} <span className="text-zinc-600">@</span> {fmtPrice(t.pricePerCoin)}
              </p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{t.date}{t.note ? ` \u00b7 ${t.note}` : ''}</p>
            </div>
            <p className="text-sm font-mono font-semibold text-zinc-300 shrink-0 tabular-nums">
              {fmtUsd(total)}
            </p>
            <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => realIdx !== undefined && onEdit(realIdx, t)}
                className="text-zinc-600 hover:text-blue-400 transition-colors cursor-pointer p-1.5 rounded-lg hover:bg-zinc-700/30"
                title="Edit"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
              </button>
              <button
                onClick={() => realIdx !== undefined && onDelete(realIdx)}
                className="text-zinc-600 hover:text-red-400 transition-colors cursor-pointer p-1.5 rounded-lg hover:bg-red-500/10"
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
