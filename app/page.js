'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

export default function Dashboard() {
  const [prices, setPrices] = useState(null);
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [pRes, cRes, sRes, nRes] = await Promise.all([
        fetch('/api/prices'),
        fetch('/api/config'),
        fetch('/api/status'),
        fetch('/api/news'),
      ]);
      setPrices(await pRes.json());
      setConfig(await cRes.json());
      setStatus(await sRes.json());
      setNews(await nRes.json());
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
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const coins = config?.coins || {};
  const hasActiveAlerts = status?.alerts?.length > 0;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800/60 sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-lg font-bold tracking-tight">Emotionless Alerts</h1>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700/50">
              Refresh
            </button>
            <Link href="/settings" className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700/50">
              Settings
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">{error}</div>
        )}

        {/* Status Banner */}
        <div className={`rounded-xl p-4 text-center ${
          hasActiveAlerts
            ? 'bg-amber-500/10 border border-amber-500/30'
            : 'bg-emerald-500/5 border border-emerald-500/20'
        }`}>
          <p className={`text-sm font-medium ${hasActiveAlerts ? 'text-amber-300' : 'text-emerald-400'}`}>
            {hasActiveAlerts
              ? `${status.alerts.length} alert(s) fired recently. Check below.`
              : 'All quiet. No action needed right now.'}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Bot checks prices daily at 2:00 PM UTC and sends you a Telegram message only when something needs attention.
          </p>
        </div>

        {/* Your Money */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Your Money</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-zinc-500">Total Budget</p>
              <p className="text-lg font-mono font-bold">{fmt(config?.totalCapital)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Invested So Far</p>
              <p className="text-lg font-mono font-bold">
                {fmt(Object.values(coins).reduce((s, c) => s + (c.holdingsUsd || 0), 0))}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Cash Ready to Deploy</p>
              <p className="text-lg font-mono font-bold text-blue-400">{fmt(config?.powderRemaining)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Emergency Reserve</p>
              <p className="text-lg font-mono font-bold text-amber-400">{fmt(config?.reserveRemaining)}</p>
            </div>
          </div>
        </div>

        {/* Coin Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.entries(coins).map(([coin, cc]) => {
            const price = prices?.[coin];
            if (!price) return null;
            const pnl = ((price - cc.avgCost) / cc.avgCost) * 100;
            const buyAt = cc.buyReference * (1 - (config?.buyBandPct || 0.07));
            const sellAt = cc.avgCost * (1 + (config?.firstSellPct || 0.4));
            const nearBuy = price <= buyAt;
            const nearSell = price >= sellAt;

            return (
              <div key={coin} className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
                {/* Coin name + price */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs text-zinc-500 font-medium">{coin}</p>
                    <p className="text-2xl font-mono font-bold mt-0.5">
                      {fmtPrice(price)}
                    </p>
                  </div>
                  <span className={`text-xs font-mono font-semibold px-2 py-1 rounded-md ${
                    pnl >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                  </span>
                </div>

                {/* Simple stats */}
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">You bought at (avg)</span>
                    <span className="font-mono">{fmtPrice(cc.avgCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">You hold</span>
                    <span className="font-mono">{fmt(cc.holdingsUsd)}</span>
                  </div>

                  <div className="border-t border-zinc-800/50 pt-3 space-y-2">
                    {/* Buy signal */}
                    <div className={`flex justify-between items-center rounded-lg px-3 py-2 ${
                      nearBuy ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-zinc-800/30'
                    }`}>
                      <span className={`text-xs ${nearBuy ? 'text-blue-300 font-medium' : 'text-zinc-500'}`}>
                        {nearBuy ? 'BUY ZONE' : 'Next buy if price drops to'}
                      </span>
                      <span className={`font-mono text-xs ${nearBuy ? 'text-blue-300 font-bold' : 'text-zinc-400'}`}>
                        {fmtPrice(buyAt)}
                      </span>
                    </div>

                    {/* Sell signal */}
                    <div className={`flex justify-between items-center rounded-lg px-3 py-2 ${
                      nearSell ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-zinc-800/30'
                    }`}>
                      <span className={`text-xs ${nearSell ? 'text-orange-300 font-medium' : 'text-zinc-500'}`}>
                        {nearSell ? 'SELL ZONE — take 15% off' : 'First sell if price rises to'}
                      </span>
                      <span className={`font-mono text-xs ${nearSell ? 'text-orange-300 font-bold' : 'text-zinc-400'}`}>
                        {fmtPrice(sellAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Safety Checks */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Safety Checks</h2>
          <p className="text-xs text-zinc-600 mb-4">These run automatically. You get a Telegram alert if any trigger.</p>
          <div className="space-y-2">
            <CheckRow
              label="Drawdown Warning"
              desc="Price drops -20%, -35%, or -50% from all-time high"
              active={Object.keys(coins).some(c => status?.rules?.[`drawdown:${c}`])}
            />
            <CheckRow
              label="Floor Confirmed"
              desc="After a deep crash, price holds above the bottom for 2 weeks"
              active={Object.keys(coins).some(c => status?.rules?.[`floorConfirmed:${c}`])}
            />
            <CheckRow
              label="Thesis Break"
              desc="BTC closes below its 200-week moving average for 2 weeks (stop buying)"
              active={status?.rules?.thesisBreak}
            />
            <CheckRow
              label="Upside Breakout"
              desc={`BTC weekly close above $${(config?.upsideBreakUsd || 90000).toLocaleString()} (deploy 40% of cash)`}
              active={status?.rules?.upsideBreak}
            />
            <CheckRow
              label="Monthly Review"
              desc="Reminder on the 1st of each month to review your positions"
              active={false}
              isInfo
            />
          </div>
        </div>

        {/* 200-Week MA */}
        {status?.ma200 && (
          <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-xs text-zinc-500">BTC 200-Week Moving Average</p>
              <p className="text-xl font-mono font-bold mt-0.5">${Math.round(status.ma200).toLocaleString()}</p>
            </div>
            <span className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
              (prices?.BTC || 0) > status.ma200
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}>
              BTC is {(prices?.BTC || 0) > status.ma200 ? 'above' : 'below'} — {(prices?.BTC || 0) > status.ma200 ? 'healthy' : 'caution'}
            </span>
          </div>
        )}

        {/* Market News */}
        {news.length > 0 && (
          <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Market News</h2>
            <p className="text-xs text-zinc-600 mb-3">High-impact news from the last 24 hours that could affect your positions.</p>
            <div className="space-y-2">
              {news.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                   className="block bg-zinc-800/30 hover:bg-zinc-800/50 rounded-lg p-3 transition-colors">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm text-zinc-200">{a.title}</p>
                    <span className="text-[10px] text-zinc-600 shrink-0">{a.source}</span>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">
                    {new Date(a.published).toLocaleString()}
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Recent Alerts */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Recent Alerts</h2>
          <p className="text-xs text-zinc-600 mb-3">Alerts sent to your Telegram. Same alert won&apos;t repeat until conditions change.</p>
          {!status?.alerts || status.alerts.length === 0 ? (
            <p className="text-zinc-600 text-sm py-4 text-center">
              No alerts yet. Silence means do nothing — that&apos;s the right move most days.
            </p>
          ) : (
            <div className="space-y-2">
              {status.alerts.map((a, i) => (
                <div key={i} className="bg-zinc-800/30 rounded-lg p-3">
                  <p className="text-xs text-zinc-500">{new Date(a.time).toLocaleString()}</p>
                  <p className="text-sm text-zinc-200 mt-1">{a.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* KV Warning */}
        {status && !status.kvConfigured && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-300/80">
            <strong>Database not connected.</strong> Your settings and alert history won&apos;t be saved between runs.
            Add your Upstash Redis credentials in Vercel to fix this.
          </div>
        )}

        <footer className="text-center text-[11px] text-zinc-700 pt-2 pb-8">
          Alert-only. Never auto-trades. Checks prices daily at 2:00 PM UTC.
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
  return n < 10 ? `$${n.toFixed(2)}` : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function CheckRow({ label, desc, active, isInfo }) {
  return (
    <div className={`flex items-start gap-3 rounded-lg px-4 py-3 ${
      active ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-zinc-800/20'
    }`}>
      <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
        active ? 'bg-amber-400 shadow-sm shadow-amber-400/50' : isInfo ? 'bg-zinc-600' : 'bg-emerald-600'
      }`} />
      <div>
        <p className={`text-sm font-medium ${active ? 'text-amber-300' : 'text-zinc-300'}`}>{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
      </div>
      <span className={`ml-auto text-xs shrink-0 ${active ? 'text-amber-400' : 'text-zinc-600'}`}>
        {active ? 'TRIGGERED' : 'quiet'}
      </span>
    </div>
  );
}
