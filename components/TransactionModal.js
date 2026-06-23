'use client';
import { useState, useEffect, useRef } from 'react';
import { COIN_COLORS, DEFAULT_COLOR, COIN_ICONS } from '@/lib/coins';

const COINS = Object.keys(COIN_COLORS);

export default function TransactionModal({ mode, coin, initialData, onSave, onClose }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    coin: initialData?.coin || coin || 'BTC',
    type: initialData?.type || 'buy',
    amount: initialData?.amount?.toString() || '',
    pricePerCoin: initialData?.pricePerCoin?.toString() || '',
    total: initialData ? (initialData.amount * initialData.pricePerCoin).toString() : '',
    date: initialData?.date || new Date().toISOString().split('T')[0],
    note: initialData?.note || '',
  });
  // Track which field the user is actively editing so we know which to auto-calc
  const [lastEdited, setLastEdited] = useState(null); // 'amount' | 'pricePerCoin' | 'total'
  const [saving, setSaving] = useState(false);
  const backdropRef = useRef(null);

  function updateField(field, value) {
    setLastEdited(field);
    setForm(f => {
      const next = { ...f, [field]: value };
      const amt = parseFloat(field === 'amount' ? value : next.amount);
      const ppc = parseFloat(field === 'pricePerCoin' ? value : next.pricePerCoin);
      const tot = parseFloat(field === 'total' ? value : next.total);

      if (field === 'amount' && !isNaN(amt) && !isNaN(ppc) && ppc > 0) {
        next.total = (amt * ppc).toString();
      } else if (field === 'amount' && !isNaN(amt) && amt > 0 && !isNaN(tot) && tot > 0) {
        next.pricePerCoin = (tot / amt).toString();
      } else if (field === 'pricePerCoin' && !isNaN(ppc) && !isNaN(amt) && amt > 0) {
        next.total = (amt * ppc).toString();
      } else if (field === 'pricePerCoin' && !isNaN(ppc) && ppc > 0 && !isNaN(tot) && tot > 0) {
        next.amount = (tot / ppc).toString();
      } else if (field === 'total' && !isNaN(tot) && !isNaN(ppc) && ppc > 0) {
        next.amount = (tot / ppc).toString();
      } else if (field === 'total' && !isNaN(tot) && !isNaN(amt) && amt > 0) {
        next.pricePerCoin = (tot / amt).toString();
      }
      return next;
    });
  }

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    const ppc = parseFloat(form.pricePerCoin);
    if (!amt || !ppc || amt <= 0 || ppc <= 0) return;
    setSaving(true);
    await onSave({
      coin: form.coin,
      type: form.type,
      amount: amt,
      pricePerCoin: ppc,
      date: form.date,
      note: form.note,
    });
    setSaving(false);
  }

  const canSubmit = parseFloat(form.amount) > 0 && parseFloat(form.pricePerCoin) > 0;

  const colors = COIN_COLORS[form.coin] || DEFAULT_COLOR;
  const isSell = form.type === 'sell';

  // Type-aware accent colors
  const accent = isSell
    ? { focus: 'focus:border-red-500/40 focus:ring-2 focus:ring-red-500/15', glow: 'shadow-red-500/20', gradient: 'from-red-500 to-red-600' }
    : { focus: 'focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/15', glow: 'shadow-emerald-500/20', gradient: 'from-emerald-500 to-emerald-600' };

  return (
    <div
      ref={backdropRef}
      onClick={(e) => e.target === backdropRef.current && onClose()}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xl animate-fade-in"
    >
      <div className="relative rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md animate-slide-up overflow-hidden">
        {/* Gradient border effect — shifts with buy/sell */}
        <div className={`absolute inset-0 rounded-t-3xl sm:rounded-2xl bg-gradient-to-b ${isSell ? 'from-red-500 to-red-700' : accent.gradient} opacity-[0.08] pointer-events-none transition-colors duration-300`} />
        <div className={`relative bg-zinc-900/95 backdrop-blur-2xl rounded-t-3xl sm:rounded-2xl border shadow-2xl shadow-black/60 p-6 sm:p-7 transition-colors duration-300 ${isSell ? 'border-red-500/15' : 'border-zinc-700/30'}`}>
          {/* Header with coin avatar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 ${
                isSell
                  ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-500/20'
                  : `bg-gradient-to-br ${colors.gradient} ${colors.glow}`
              }`}>
                <span className="text-white text-sm font-bold">{COIN_ICONS[form.coin] || '?'}</span>
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight">
                  {isEdit ? 'Edit Transaction' : coin ? `${isSell ? 'Sell' : 'Add'} ${form.coin}` : 'New Transaction'}
                </h2>
                <p className={`text-[11px] mt-0.5 transition-colors duration-300 ${isSell ? 'text-red-400/60' : 'text-zinc-500'}`}>
                  {isEdit ? 'Modify and recalculate' : isSell ? 'Record a sell order' : 'Record a buy order'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer p-2 rounded-xl hover:bg-zinc-800/60">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Coin selector (only when not locked to a coin) */}
            {!coin && (
              <div>
                <label className="text-[11px] text-zinc-500 mb-2 block font-medium uppercase tracking-wider">Coin</label>
                <div className="flex gap-2">
                  {COINS.map(c => {
                    const cc = COIN_COLORS[c] || DEFAULT_COLOR;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, coin: c }))}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          form.coin === c
                            ? `bg-gradient-to-br ${cc.gradient} text-white shadow-lg ${cc.glow} ring-1 ${cc.ring}`
                            : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800/70 border border-zinc-700/30'
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Type toggle */}
            <div>
              <label className="text-[11px] text-zinc-500 mb-2 block font-medium uppercase tracking-wider">Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: 'buy' }))}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer ${
                    form.type === 'buy'
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 ring-1 ring-emerald-400/30'
                      : 'bg-zinc-800/50 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/70 border border-zinc-700/30'
                  }`}
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: 'sell' }))}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer ${
                    form.type === 'sell'
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/25 ring-1 ring-red-400/30'
                      : 'bg-zinc-800/50 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/70 border border-zinc-700/30'
                  }`}
                >
                  Sell
                </button>
              </div>
            </div>

            {/* Amount + Price + Total — enter any 2, 3rd auto-calculates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-500 mb-2 block font-medium uppercase tracking-wider">Quantity ({form.coin})</label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.02"
                  value={form.amount}
                  onChange={(e) => updateField('amount', e.target.value)}
                  className={`w-full bg-zinc-800/50 border border-zinc-700/30 rounded-xl px-3.5 py-3 text-sm font-mono focus:outline-none ${accent.focus} transition-all placeholder:text-zinc-600 ${lastEdited && lastEdited !== 'amount' && form.amount && !form.pricePerCoin ? '' : ''}`}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-2 block font-medium uppercase tracking-wider">Price per coin ($)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="95,000"
                  value={form.pricePerCoin}
                  onChange={(e) => updateField('pricePerCoin', e.target.value)}
                  className={`w-full bg-zinc-800/50 border border-zinc-700/30 rounded-xl px-3.5 py-3 text-sm font-mono focus:outline-none ${accent.focus} transition-all placeholder:text-zinc-600`}
                />
              </div>
            </div>

            {/* Total — editable, auto-calculates the missing field */}
            <div>
              <label className="text-[11px] text-zinc-500 mb-2 block font-medium uppercase tracking-wider">Total ($)</label>
              <div className={`bg-gradient-to-r border rounded-xl flex items-center transition-colors duration-300 ${
                isSell
                  ? 'from-red-500/5 to-red-500/10 border-red-500/15'
                  : 'from-emerald-500/5 to-emerald-500/10 border-emerald-500/15'
              }`}>
                <span className="text-zinc-500 pl-4 text-sm font-mono">$</span>
                <input
                  type="number"
                  step="any"
                  placeholder="500"
                  value={form.total}
                  onChange={(e) => updateField('total', e.target.value)}
                  className={`w-full bg-transparent py-3.5 px-2 text-sm font-mono font-bold tabular-nums tracking-tight focus:outline-none placeholder:text-zinc-600 ${isSell ? 'text-red-300' : 'text-white'}`}
                />
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">Enter any 2 fields — the 3rd auto-calculates</p>
            </div>

            {/* Date + Note row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-500 mb-2 block font-medium uppercase tracking-wider">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                  className={`w-full bg-zinc-800/50 border border-zinc-700/30 rounded-xl px-3.5 py-3 text-sm focus:outline-none ${accent.focus} transition-all`}
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-2 block font-medium uppercase tracking-wider">Note</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={form.note}
                  onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                  className={`w-full bg-zinc-800/50 border border-zinc-700/30 rounded-xl px-3.5 py-3 text-sm focus:outline-none ${accent.focus} transition-all placeholder:text-zinc-600`}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={saving || !canSubmit}
              className={`w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 cursor-pointer mt-2 ${
                isSell
                  ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-lg shadow-red-500/25 ring-1 ring-red-400/20'
                  : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25 ring-1 ring-emerald-400/20'
              } disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:ring-0`}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </span>
              ) : isEdit ? 'Update Transaction' : `Record ${isSell ? 'Sell' : 'Buy'}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
