'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { coinBadge } from '@/lib/coins';
import { fmtUsd, fmtCoinAmt } from '@/lib/format';
import BottomNav from '@/components/BottomNav';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
  const [activePid, setActivePid] = useState(null);
  const [form, setForm] = useState({
    coin: 'BTC',
    type: 'buy',
    amount: '',
    pricePerCoin: '',
    date: new Date().toISOString().split('T')[0],
  });

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
    fetch(`/api/transactions?portfolio=${activePid}`)
      .then((r) => r.json())
      .then((t) => { setTransactions(Array.isArray(t) ? t : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activePid]);

  function switchPortfolio(pid) {
    setActivePid(pid);
    window.history.replaceState(null, '', `?portfolio=${pid}`);
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.amount || !form.pricePerCoin) {
      showToast('Fill in amount and price', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
          pricePerCoin: parseFloat(form.pricePerCoin),
          portfolio: activePid,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTransactions((prev) => [...prev, data.transaction]);
        setForm((prev) => ({ ...prev, amount: '', pricePerCoin: '' }));
        showToast(`${form.type.toUpperCase()} recorded! Portfolio updated.`);
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(index) {
    if (!confirm('Delete this transaction? Your portfolio will be recalculated.')) return;
    try {
      const res = await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, portfolio: activePid }),
      });
      if (res.ok) {
        setTransactions((prev) => prev.filter((_, i) => i !== index));
        showToast('Deleted. Portfolio recalculated.');
      }
    } catch {
      showToast('Delete failed', 'error');
    }
  }

  if (loading || !activePid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-9 h-9 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const activePortfolio = portfolios.find(p => p.id === activePid);

  const coinSummaries = {};
  for (const t of transactions) {
    if (!coinSummaries[t.coin]) coinSummaries[t.coin] = { buys: [], sells: [] };
    if (t.type === 'buy') coinSummaries[t.coin].buys.push(t);
    else coinSummaries[t.coin].sells.push(t);
  }
  const summaries = Object.entries(coinSummaries).map(([coin, { buys, sells }]) => {
    const totalBought = buys.reduce((s, t) => s + t.amount, 0);
    const totalSold = sells.reduce((s, t) => s + t.amount, 0);
    const totalHeld = totalBought - totalSold;
    const totalSpent = buys.reduce((s, t) => s + t.amount * t.pricePerCoin, 0);
    const totalReceived = sells.reduce((s, t) => s + t.amount * t.pricePerCoin, 0);
    const avgCost = totalBought > 0 ? totalSpent / totalBought : 0;
    const numBuys = buys.length;
    const numSells = sells.length;
    return { coin, totalHeld, totalSpent, totalReceived, avgCost, numBuys, numSells };
  });

  return (
    <div className="min-h-screen">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg animate-toast ${
          toast.type === 'error'
            ? 'bg-red-500/15 border border-red-500/30 text-red-300'
            : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-800/40 sticky top-0 z-10 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/" className="hidden sm:flex text-zinc-500 hover:text-zinc-300 transition-colors text-sm items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
              Dashboard
            </Link>
            <div className="w-px h-4 bg-zinc-800 hidden sm:block" />
            <h1 className="text-base font-bold">Transactions</h1>
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
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-6 space-y-5">
        {/* Portfolio badge */}
        {activePortfolio && (
          <div className="flex items-center gap-2 animate-fade-up">
            <span className="text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-md border border-emerald-500/20">
              {activePortfolio.name}
            </span>
            <span className="text-[11px] text-zinc-600">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Explainer */}
        <div className="bg-blue-500/[0.04] border border-blue-500/15 rounded-2xl p-4 text-sm text-blue-300/80 animate-fade-up">
          Log your buys and sells here. Your <strong className="text-blue-300">average cost</strong>, <strong className="text-blue-300">holdings</strong>, and <strong className="text-blue-300">buy reference</strong> are all calculated automatically from your transactions.
        </div>

        {/* Add Transaction Form */}
        <form onSubmit={handleAdd} className="bg-zinc-900/60 border border-zinc-800/50 rounded-2xl p-5 animate-fade-up" style={{ animationDelay: '50ms' }}>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Add Transaction</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Coin</label>
              <select
                value={form.coin}
                onChange={(e) => setForm((f) => ({ ...f, coin: e.target.value }))}
                className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-600 transition-colors cursor-pointer"
              >
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
                <option value="SOL">SOL</option>
                <option value="AQUARI">AQUARI</option>
                <option value="XAUT">XAUT (Gold)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Type</label>
              <div className="flex rounded-xl overflow-hidden border border-zinc-700/40">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: 'buy' }))}
                  className={`flex-1 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                    form.type === 'buy'
                      ? 'bg-emerald-600 text-white shadow-inner'
                      : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/60'
                  }`}
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: 'sell' }))}
                  className={`flex-1 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                    form.type === 'sell'
                      ? 'bg-red-600 text-white shadow-inner'
                      : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/60'
                  }`}
                >
                  Sell
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Amount (coins)</label>
              <input
                type="number"
                step="any"
                placeholder="0.02"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-zinc-600 transition-colors"
              />
              <p className="text-[10px] text-zinc-600 mt-1">e.g. 0.02 BTC</p>
            </div>

            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Price per coin ($)</label>
              <input
                type="number"
                step="any"
                placeholder="95000"
                value={form.pricePerCoin}
                onChange={(e) => setForm((f) => ({ ...f, pricePerCoin: e.target.value }))}
                className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-zinc-600 transition-colors"
              />
              <p className="text-[10px] text-zinc-600 mt-1">Price you paid/received</p>
            </div>

            <div className="flex flex-col justify-end">
              <p className="text-[11px] text-zinc-500 mb-1.5 font-medium">Total</p>
              <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-xl px-3 py-2.5 min-h-[42px] flex items-center">
                <p className="text-lg font-mono font-bold text-zinc-300 tabular-nums">
                  {form.amount && form.pricePerCoin
                    ? `$${(parseFloat(form.amount) * parseFloat(form.pricePerCoin)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : '\u2014'}
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className={`mt-4 w-full py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
              form.type === 'buy'
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/10'
                : 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/10'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {saving ? 'Saving...' : `Record ${form.type === 'buy' ? 'Buy' : 'Sell'}`}
          </button>
        </form>

        {/* Per-Coin Summary */}
        {summaries.length > 0 && (
          <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-2xl p-5 animate-fade-up" style={{ animationDelay: '100ms' }}>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Portfolio Breakdown</h2>
            <div className="space-y-3">
              {summaries.map(({ coin, totalHeld, totalSpent, totalReceived, avgCost, numBuys, numSells }) => (
                <div key={coin} className="bg-zinc-800/30 hover:bg-zinc-800/40 rounded-xl p-4 transition-colors active:scale-[0.98] sm:active:scale-100">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${coinBadge(coin)}`}>{coin}</span>
                    <span className="text-[10px] text-zinc-600">
                      {numBuys} buy{numBuys !== 1 ? 's' : ''}{numSells > 0 ? `, ${numSells} sell${numSells !== 1 ? 's' : ''}` : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-zinc-500">Holdings</p>
                      <p className="font-mono text-zinc-200 mt-0.5 tabular-nums">{fmtCoinAmt(totalHeld)} {coin}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Total cost</p>
                      <p className="font-mono text-zinc-200 mt-0.5 tabular-nums">{fmtUsd(totalSpent)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Avg cost</p>
                      <p className="font-mono text-zinc-200 mt-0.5 tabular-nums">{fmtUsd(avgCost)}</p>
                    </div>
                    {totalReceived > 0 && (
                      <div>
                        <p className="text-zinc-500">Total sold</p>
                        <p className="font-mono text-zinc-200 mt-0.5 tabular-nums">{fmtUsd(totalReceived)}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction History */}
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-2xl p-5 animate-fade-up" style={{ animationDelay: '150ms' }}>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Transaction History</h2>
          {transactions.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-zinc-800/60 flex items-center justify-center">
                <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <p className="text-zinc-500 text-sm">No transactions yet</p>
              <p className="text-zinc-600 text-xs mt-1">Add your buys and sells above to start tracking.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...transactions].reverse().map((t, i) => {
                const realIndex = transactions.length - 1 - i;
                const total = t.amount * t.pricePerCoin;
                return (
                  <div key={i} className="flex items-center gap-3 bg-zinc-800/25 hover:bg-zinc-800/40 rounded-xl px-4 py-3 transition-colors group">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                      t.type === 'buy'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {t.type}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${coinBadge(t.coin)}`}>
                      {t.coin}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-zinc-200 tabular-nums">
                        {t.amount} @ ${Number(t.pricePerCoin).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-zinc-600">{t.date}</p>
                    </div>
                    <p className="text-sm font-mono font-semibold text-zinc-300 shrink-0 tabular-nums">
                      ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                    <button
                      onClick={() => handleDelete(realIndex)}
                      className="text-zinc-600 hover:text-red-400 transition-colors ml-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
                      title="Delete transaction"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="text-center text-[11px] text-zinc-700 pt-4 pb-8 hidden sm:block">
          Transactions auto-calculate your holdings, average cost, and buy reference per portfolio.
        </footer>
      </main>

      <BottomNav active="transactions" portfolioId={activePid} />
    </div>
  );
}

