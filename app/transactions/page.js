'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({
    coin: 'BTC',
    type: 'buy',
    amount: '',
    pricePerCoin: '',
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetch('/api/transactions')
      .then((r) => r.json())
      .then((t) => { setTransactions(Array.isArray(t) ? t : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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
        body: JSON.stringify({ index }),
      });
      if (res.ok) {
        setTransactions((prev) => prev.filter((_, i) => i !== index));
        showToast('Deleted. Portfolio recalculated.');
      }
    } catch {
      showToast('Delete failed', 'error');
    }
  }

  const totalUsd = (coin, type) =>
    transactions
      .filter((t) => t.coin === coin && t.type === type)
      .reduce((s, t) => s + t.amount * t.pricePerCoin, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === 'error'
            ? 'bg-red-500/20 border border-red-500/40 text-red-300'
            : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-800/60 sticky top-0 z-10 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm">&larr; Dashboard</Link>
            <h1 className="text-lg font-bold">Transactions</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Explainer */}
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-300/80">
          Log your buys and sells here — just like CoinGecko portfolio. Your <strong>average cost</strong>, <strong>holdings</strong>, and <strong>buy reference</strong> are all calculated automatically from your transactions.
        </div>

        {/* Add Transaction Form */}
        <form onSubmit={handleAdd} className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Add Transaction</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Coin */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Coin</label>
              <select
                value={form.coin}
                onChange={(e) => setForm((f) => ({ ...f, coin: e.target.value }))}
                className="w-full bg-zinc-800/80 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-500"
              >
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
                <option value="SOL">SOL</option>
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Type</label>
              <div className="flex rounded-lg overflow-hidden border border-zinc-700/50">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: 'buy' }))}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    form.type === 'buy'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: 'sell' }))}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    form.type === 'sell'
                      ? 'bg-red-600 text-white'
                      : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  Sell
                </button>
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-zinc-800/80 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-500"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Amount (coins)</label>
              <input
                type="number"
                step="any"
                placeholder="0.02"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full bg-zinc-800/80 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-zinc-500"
              />
              <p className="text-[10px] text-zinc-600 mt-1">How many coins, e.g. 0.02 BTC</p>
            </div>

            {/* Price */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Price per coin ($)</label>
              <input
                type="number"
                step="any"
                placeholder="95000"
                value={form.pricePerCoin}
                onChange={(e) => setForm((f) => ({ ...f, pricePerCoin: e.target.value }))}
                className="w-full bg-zinc-800/80 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-zinc-500"
              />
              <p className="text-[10px] text-zinc-600 mt-1">The price you paid/received per coin</p>
            </div>

            {/* Total preview */}
            <div className="flex flex-col justify-end">
              <p className="text-xs text-zinc-500 mb-1">Total</p>
              <p className="text-lg font-mono font-bold text-zinc-300 py-1">
                {form.amount && form.pricePerCoin
                  ? `$${(parseFloat(form.amount) * parseFloat(form.pricePerCoin)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : '—'}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className={`mt-4 w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
              form.type === 'buy'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-red-600 hover:bg-red-500'
            } disabled:opacity-50`}
          >
            {saving ? 'Saving...' : `Record ${form.type === 'buy' ? 'Buy' : 'Sell'}`}
          </button>
        </form>

        {/* Transaction History */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Transaction History</h2>
          {transactions.length === 0 ? (
            <p className="text-zinc-600 text-sm py-6 text-center">
              No transactions yet. Add your buys and sells above to track your portfolio automatically.
            </p>
          ) : (
            <div className="space-y-2">
              {[...transactions].reverse().map((t, i) => {
                const realIndex = transactions.length - 1 - i;
                const total = t.amount * t.pricePerCoin;
                return (
                  <div key={i} className="flex items-center gap-3 bg-zinc-800/30 rounded-lg px-4 py-3">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                      t.type === 'buy'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-red-500/15 text-red-400'
                    }`}>
                      {t.type}
                    </span>
                    <span className="text-xs font-bold text-zinc-300 bg-zinc-700/50 px-2 py-0.5 rounded">
                      {t.coin}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-zinc-200">
                        {t.amount} @ ${Number(t.pricePerCoin).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-zinc-600">{t.date}</p>
                    </div>
                    <p className="text-sm font-mono font-semibold text-zinc-300 shrink-0">
                      ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                    <button
                      onClick={() => handleDelete(realIndex)}
                      className="text-zinc-600 hover:text-red-400 transition-colors ml-1 text-xs"
                      title="Delete transaction"
                    >
                      &times;
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="text-center text-[11px] text-zinc-700 pt-2 pb-8">
          Transactions auto-calculate your holdings, average cost, and buy reference.
        </footer>
      </main>
    </div>
  );
}
