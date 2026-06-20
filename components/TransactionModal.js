'use client';
import { useState, useEffect, useRef } from 'react';

const COINS = ['BTC', 'ETH', 'SOL', 'AQUARI', 'XAUT'];

export default function TransactionModal({ mode, coin, initialData, onSave, onClose }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    coin: initialData?.coin || coin || 'BTC',
    type: initialData?.type || 'buy',
    amount: initialData?.amount?.toString() || '',
    pricePerCoin: initialData?.pricePerCoin?.toString() || '',
    date: initialData?.date || new Date().toISOString().split('T')[0],
    note: initialData?.note || '',
  });
  const [saving, setSaving] = useState(false);
  const backdropRef = useRef(null);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.amount || !form.pricePerCoin) return;
    setSaving(true);
    await onSave({
      coin: form.coin,
      type: form.type,
      amount: parseFloat(form.amount),
      pricePerCoin: parseFloat(form.pricePerCoin),
      date: form.date,
      note: form.note,
    });
    setSaving(false);
  }

  const total = form.amount && form.pricePerCoin
    ? parseFloat(form.amount) * parseFloat(form.pricePerCoin)
    : null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => e.target === backdropRef.current && onClose()}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-zinc-900 border border-zinc-800/60 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 sm:p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold">
            {isEdit ? 'Edit Transaction' : `Add ${form.coin} Transaction`}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Coin selector (only when not locked to a coin) */}
          {!coin && (
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Coin</label>
              <select
                value={form.coin}
                onChange={(e) => setForm(f => ({ ...f, coin: e.target.value }))}
                className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-600 transition-colors cursor-pointer"
              >
                {COINS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Type toggle */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Type</label>
            <div className="flex rounded-xl overflow-hidden border border-zinc-700/40">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, type: 'buy' }))}
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
                onClick={() => setForm(f => ({ ...f, type: 'sell' }))}
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

          {/* Amount + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Amount ({form.coin})</label>
              <input
                type="number"
                step="any"
                placeholder="0.02"
                value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-zinc-600 transition-colors"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Price per coin ($)</label>
              <input
                type="number"
                step="any"
                placeholder="95000"
                value={form.pricePerCoin}
                onChange={(e) => setForm(f => ({ ...f, pricePerCoin: e.target.value }))}
                className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>
          </div>

          {/* Total */}
          {total !== null && !isNaN(total) && (
            <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
              <span className="text-[11px] text-zinc-500 font-medium">Total</span>
              <span className="text-lg font-mono font-bold tabular-nums">
                ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>

          {/* Note (optional) */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium">Note <span className="text-zinc-600">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. DCA buy, took profits"
              value={form.note}
              onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
              className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || !form.amount || !form.pricePerCoin}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
              form.type === 'buy'
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/10'
                : 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/10'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {saving ? 'Saving...' : isEdit ? 'Update Transaction' : `Record ${form.type === 'buy' ? 'Buy' : 'Sell'}`}
          </button>
        </form>
      </div>
    </div>
  );
}
