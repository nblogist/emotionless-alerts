'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

export default function Dashboard() {
  const [prices, setPrices] = useState(null);
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [pRes, cRes, sRes] = await Promise.all([
        fetch('/api/prices'),
        fetch('/api/config'),
        fetch('/api/status'),
      ]);
      setPrices(await pRes.json());
      setConfig(await cRes.json());
      setStatus(await sRes.json());
      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
          <span className="text-zinc-500 text-sm">Loading market data...</span>
        </div>
      </div>
    );
  }

  const coins = config?.coins || {};
  const deployed = Object.values(coins).reduce((s, c) => s + (c.holdingsUsd || 0), 0);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800/60 backdrop-blur-sm sticky top-0 z-10 bg-zinc-950/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              EMOTIONLESS ALERTS
            </h1>
            <p className="text-[11px] text-zinc-600 mt-0.5 font-mono">
              {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'Loading...'}
              {status?.weeklyCloseCount > 0 && ` · ${status.weeklyCloseCount} weekly closes tracked`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="px-3 py-1.5 text-xs bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/50 rounded-lg transition-all hover:border-zinc-600"
            >
              Refresh
            </button>
            <Link
              href="/settings"
              className="px-4 py-1.5 text-xs bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/50 rounded-lg transition-all hover:border-zinc-600"
            >
              Settings
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Portfolio Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Capital" value={fmt(config?.totalCapital)} />
          <StatCard label="Deployed" value={fmt(deployed)} />
          <StatCard label="Powder" value={fmt(config?.powderRemaining)} color="blue" />
          <StatCard label="Reserve" value={fmt(config?.reserveRemaining)} color="amber" />
        </div>

        {/* Coin Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(coins).map(([coin, cc]) => {
            const price = prices?.[coin];
            if (!price) return null;
            const buyAt = cc.buyReference * (1 - (config?.buyBandPct || 0.07));
            const pnl = ((price - cc.avgCost) / cc.avgCost) * 100;
            const gapToBuy = ((price - buyAt) / buyAt) * 100;
            const firstSell = cc.avgCost * (1 + (config?.firstSellPct || 0.4));
            const gapToSell = ((price - firstSell) / firstSell) * 100;

            return (
              <div
                key={coin}
                className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 hover:border-zinc-700/60 transition-colors"
              >
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      {coin}
                    </span>
                    <p className="text-2xl sm:text-3xl font-mono font-bold tabular-nums mt-1">
                      ${price < 10 ? price.toFixed(2) : price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-mono font-semibold px-2 py-1 rounded-md ${
                      pnl >= 0
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {pnl >= 0 ? '+' : ''}
                    {pnl.toFixed(1)}%
                  </span>
                </div>

                <div className="space-y-2.5 text-[13px]">
                  <Row label="Avg Cost" value={fmtPrice(cc.avgCost)} />
                  <Row label="Holdings" value={fmt(cc.holdingsUsd)} />

                  <div className="border-t border-zinc-800/50 my-3" />

                  <Row label="Buy Ref" value={fmtPrice(cc.buyReference)} />
                  <Row
                    label="Buy Band"
                    value={fmtPrice(buyAt)}
                    valueClass="text-blue-400"
                  />
                  <Row
                    label="Gap to Buy"
                    value={`${gapToBuy <= 0 ? '' : '+'}${gapToBuy.toFixed(1)}%`}
                    valueClass={gapToBuy <= 0 ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}
                  />

                  <div className="border-t border-zinc-800/50 my-3" />

                  <Row
                    label="1st Sell At"
                    value={fmtPrice(firstSell)}
                    valueClass="text-orange-400"
                  />
                  <Row
                    label="Gap to Sell"
                    value={`${gapToSell >= 0 ? '+' : ''}${gapToSell.toFixed(1)}%`}
                    valueClass={gapToSell >= 0 ? 'text-orange-400 font-semibold' : 'text-zinc-400'}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Rule Status */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
            Rule Status
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500">
                  <th className="text-left pb-3 pr-6 font-medium">Rule</th>
                  {Object.keys(coins).map((c) => (
                    <th key={c} className="pb-3 px-4 text-center font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                <RuleRow
                  name="Buy Band"
                  coins={coins}
                  status={status}
                  ruleKey="buyBand"
                />
                <RuleRow
                  name="Sell Trigger"
                  coins={coins}
                  status={status}
                  ruleKey="sellTrigger"
                />
                <RuleRow
                  name="Drawdown"
                  coins={coins}
                  status={status}
                  ruleKey="drawdown"
                  renderValue={(val) =>
                    val ? `-${val}%` : null
                  }
                />
                <RuleRow
                  name="Floor Confirmed"
                  coins={coins}
                  status={status}
                  ruleKey="floorConfirmed"
                />
                <tr>
                  <td className="py-3 pr-6 text-zinc-300">Thesis Break</td>
                  <td
                    className="py-3 px-4 text-center"
                    colSpan={Object.keys(coins).length}
                  >
                    <Dot active={status?.rules?.thesisBreak} />
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-6 text-zinc-300">Upside Break</td>
                  <td
                    className="py-3 px-4 text-center"
                    colSpan={Object.keys(coins).length}
                  >
                    <Dot active={status?.rules?.upsideBreak} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 200-Week MA */}
        {status?.ma200 && (
          <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                BTC 200-Week Moving Average
              </h2>
              <p className="text-2xl font-mono font-bold mt-1">
                ${Math.round(status.ma200).toLocaleString()}
              </p>
            </div>
            <div
              className={`text-sm font-medium px-3 py-1.5 rounded-lg ${
                (prices?.BTC || 0) > status.ma200
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              BTC is {(prices?.BTC || 0) > status.ma200 ? 'above' : 'below'} 200wMA
            </div>
          </div>
        )}

        {/* Recent Alerts */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
            Recent Alerts
          </h2>
          {!status?.alerts || status.alerts.length === 0 ? (
            <p className="text-zinc-600 text-sm italic">
              No alerts yet. Silence = do nothing. That&apos;s correct.
            </p>
          ) : (
            <div className="space-y-2">
              {status.alerts.map((a, i) => (
                <div
                  key={i}
                  className="bg-zinc-800/30 border border-zinc-800/50 rounded-xl p-3"
                >
                  <span className="text-[11px] font-mono text-zinc-600">
                    {new Date(a.time).toLocaleString()}
                  </span>
                  <p className="text-sm text-zinc-200 mt-1 font-mono leading-relaxed">
                    {a.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* KV Warning */}
        {status && !status.kvConfigured && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 text-sm text-amber-300/80">
            <strong className="text-amber-300">KV store not configured.</strong>{' '}
            Set <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">UPSTASH_REDIS_REST_URL</code> and{' '}
            <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">UPSTASH_REDIS_REST_TOKEN</code>{' '}
            in Vercel environment variables for persistent state.
            Config changes and rule tracking won&apos;t persist without it.
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-[11px] text-zinc-700 pt-4 pb-8">
          Emotionless Alerts v1.0 · Alert-only, never auto-trade · Cron runs daily at 14:00 UTC
        </footer>
      </main>
    </div>
  );
}

/* ---------- Helpers ---------- */

function fmt(n) {
  return n != null ? `$${Number(n).toLocaleString()}` : '—';
}
function fmtPrice(n) {
  if (n == null) return '—';
  return n < 10
    ? `$${n.toFixed(2)}`
    : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function StatCard({ label, value, color }) {
  const colorClass =
    color === 'blue'
      ? 'text-blue-400'
      : color === 'amber'
        ? 'text-amber-400'
        : 'text-zinc-100';
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-4">
      <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
        {label}
      </p>
      <p className={`text-lg sm:text-xl font-mono font-bold mt-1 tabular-nums ${colorClass}`}>
        {value}
      </p>
    </div>
  );
}

function Row({ label, value, valueClass = 'text-zinc-200' }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-mono tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

function RuleRow({ name, coins, status, ruleKey, renderValue }) {
  return (
    <tr>
      <td className="py-3 pr-6 text-zinc-300">{name}</td>
      {Object.keys(coins || {}).map((coin) => {
        const val = status?.rules?.[`${ruleKey}:${coin}`];
        const active = renderValue ? !!val : !!val;
        return (
          <td key={coin} className="py-3 px-4 text-center">
            <Dot
              active={active}
              label={renderValue && val ? renderValue(val) : undefined}
            />
          </td>
        );
      })}
    </tr>
  );
}

function Dot({ active, label }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-mono ${
        active ? 'text-amber-400' : 'text-zinc-600'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          active ? 'bg-amber-400 shadow-sm shadow-amber-400/50' : 'bg-zinc-700'
        }`}
      />
      {label || (active ? 'ACTIVE' : 'quiet')}
    </span>
  );
}
