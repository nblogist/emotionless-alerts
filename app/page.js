'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

export default function Dashboard() {
  const [prices, setPrices] = useState(null);
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [news, setNews] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [pRes, cRes, sRes, nRes, aRes] = await Promise.all([
        fetch('/api/prices'),
        fetch('/api/config'),
        fetch('/api/status'),
        fetch('/api/news'),
        fetch('/api/activity'),
      ]);
      setPrices(await pRes.json());
      setConfig(await cRes.json());
      setStatus(await sRes.json());
      setNews(await nRes.json());
      setActivity(await aRes.json());
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
            <Link href="/transactions" className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700/50">
              Transactions
            </Link>
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
            Bot checks prices every hour and sends you a Telegram + email alert only when something needs attention.
          </p>
        </div>

        {/* Your Money */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Your Money</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <Tip text="The total amount of money you've set aside for crypto investing.">
                <p className="text-xs text-zinc-500">Total Budget</p>
              </Tip>
              <p className="text-lg font-mono font-bold">{fmt(config?.totalCapital)}</p>
            </div>
            <div>
              <Tip text="The total USD value of all your current crypto positions combined.">
                <p className="text-xs text-zinc-500">Invested So Far</p>
              </Tip>
              <p className="text-lg font-mono font-bold">
                {fmt(Object.values(coins).reduce((s, c) => s + (c.holdingsUsd || 0), 0))}
              </p>
            </div>
            <div>
              <Tip text="Cash you still have available to buy dips. This goes down each time you buy. Set in Settings or auto-calculated from your transactions.">
                <p className="text-xs text-zinc-500">Cash Ready to Deploy</p>
              </Tip>
              <p className="text-lg font-mono font-bold text-blue-400">{fmt(config?.powderRemaining)}</p>
            </div>
            <div>
              <Tip text="Emergency cash only used when the market crashes hard (-35% to -50%) AND a floor is confirmed. This is your safety net for buying the absolute bottom.">
                <p className="text-xs text-zinc-500">Emergency Reserve</p>
              </Tip>
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
                  <Tip text={`Your profit/loss. You bought ${coin} at an average of ${fmtPrice(cc.avgCost)} and it's now ${fmtPrice(price)}. ${pnl >= 0 ? 'You are in profit.' : 'You are at a loss — this is normal during dips.'}`}>
                    <span className={`text-xs font-mono font-semibold px-2 py-1 rounded-md ${
                      pnl >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                    }`}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                    </span>
                  </Tip>
                </div>

                {/* Simple stats */}
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <Tip text={`The weighted average price of all your ${coin} buys. Example: if you bought 0.01 BTC at $90k and 0.01 at $80k, your avg cost is $85k.`}>
                      <span className="text-zinc-500">You bought at (avg)</span>
                    </Tip>
                    <span className="font-mono">{fmtPrice(cc.avgCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <Tip text={`Total USD value of your ${coin} position based on your average cost. Add transactions to update this automatically.`}>
                      <span className="text-zinc-500">You hold</span>
                    </Tip>
                    <span className="font-mono">{fmt(cc.holdingsUsd)}</span>
                  </div>

                  <div className="border-t border-zinc-800/50 pt-3 space-y-2">
                    {/* Buy signal */}
                    <Tip text={nearBuy
                      ? `${coin} is in the BUY ZONE! The price dropped 7%+ below your last buy reference of ${fmtPrice(cc.buyReference)}. The strategy says: deploy your next rung of cash now.`
                      : `${coin} needs to drop to ${fmtPrice(buyAt)} before you should buy more. This is 7% below your last buy reference of ${fmtPrice(cc.buyReference)}. Example: if you bought BTC at $100k, the next buy triggers at $93k.`
                    }>
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
                    </Tip>

                    {/* Sell signal */}
                    <Tip text={nearSell
                      ? `${coin} is in the SELL ZONE! Price is +40%+ above your avg cost of ${fmtPrice(cc.avgCost)}. The strategy says: sell 15% of your position to lock in profit, keep the rest riding.`
                      : `${coin} needs to rise to ${fmtPrice(sellAt)} before you should take profit. This is +40% above your avg cost of ${fmtPrice(cc.avgCost)}. Example: if your avg cost is $1,000, first sell triggers at $1,400.`
                    }>
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
                    </Tip>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Safety Checks */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Safety Checks</h2>
          <p className="text-xs text-zinc-600 mb-4">These run automatically. You get a Telegram + email alert if any trigger.</p>
          <div className="space-y-2">
            <CheckRow
              label="Drawdown Warning"
              desc="Price drops -20%, -35%, or -50% from all-time high"
              tooltip="Tracks how far each coin has fallen from its highest price. At -20%: keep buying dips. At -35% or -50%: STOP buying and wait for a floor. Example: BTC hit $100k then dropped to $65k = -35% drawdown."
              active={Object.keys(coins).some(c => status?.rules?.[`drawdown:${c}`])}
            />
            <CheckRow
              label="Floor Confirmed"
              desc="After a deep crash, price holds above the bottom for 2 weeks"
              tooltip="After a -35% or -50% crash, if the price closes above the lowest point for 2 consecutive weeks, the crash is likely over. This unlocks your Emergency Reserve to buy at the bottom. Example: BTC crashes to $40k, then closes at $42k and $43k two weeks in a row = floor confirmed."
              active={Object.keys(coins).some(c => status?.rules?.[`floorConfirmed:${c}`])}
            />
            <CheckRow
              label="Thesis Break"
              desc="BTC closes below its 200-week moving average for 2 weeks (stop buying)"
              tooltip="The 200-week moving average is BTC's long-term support line. If BTC closes below it for 2 weeks in a row, the bull thesis may be broken. Action: STOP all buying, just hold what you have. Resume buying when BTC closes back above. This has only happened a few times in BTC history."
              active={status?.rules?.thesisBreak}
            />
            <CheckRow
              label="Upside Breakout"
              desc={`BTC weekly close above $${(config?.upsideBreakUsd || 90000).toLocaleString()} (deploy 40% of cash)`}
              tooltip={`If BTC closes a week above $${(config?.upsideBreakUsd || 90000).toLocaleString()}, the downtrend is over and momentum is back. Action: deploy 40% of your remaining cash at market price immediately. Don't wait for a dip. You can change this threshold in Settings.`}
              active={status?.rules?.upsideBreak}
            />
            <CheckRow
              label="Monthly Review"
              desc="Reminder on the 1st of each month to review your positions"
              tooltip="On the 1st of every month, you get a summary of all your positions, profit/loss, and remaining cash. Take 10 minutes to review and make sure your plan still makes sense."
              active={false}
              isInfo
            />
          </div>
        </div>

        {/* 200-Week MA */}
        {status?.ma200 && (
          <Tip text="The 200-week moving average is the average BTC price over the last ~4 years. If BTC is above it, the long-term trend is healthy. If below for 2+ weeks, the strategy says stop buying. Think of it as BTC's long-term heartbeat.">
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
          </Tip>
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
          <p className="text-xs text-zinc-600 mb-3">Alerts sent to your Telegram + email. Same alert won&apos;t repeat until conditions change.</p>
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

        {/* Activity Log */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Activity Log</h2>
          <p className="text-xs text-zinc-600 mb-3">Every hour, the bot checks prices and evaluates all rules. Here&apos;s what happened.</p>
          {activity.length === 0 ? (
            <p className="text-zinc-600 text-sm py-4 text-center">
              No activity yet. The bot will log its first check on the next hourly cron run.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {activity.slice(0, 48).map((entry, i) => (
                <div key={i} className="flex items-center gap-3 bg-zinc-800/20 rounded-lg px-3 py-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    entry.alertCount > 0 ? 'bg-amber-400' : 'bg-emerald-600'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">
                        {new Date(entry.time).toLocaleString()}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        entry.alertCount > 0
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-zinc-700/50 text-zinc-500'
                      }`}>
                        {entry.summary}
                      </span>
                    </div>
                    {entry.prices && (
                      <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">
                        {Object.entries(entry.prices).map(([c, p]) =>
                          p ? `${c}: $${Number(p).toLocaleString()}` : null
                        ).filter(Boolean).join(' / ')}
                      </p>
                    )}
                  </div>
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
          Alert-only. Never auto-trades. Checks prices every hour.
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

function Tip({ text, children }) {
  return (
    <span className="relative group/tip inline-block">
      {children}
      <span className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 leading-relaxed shadow-xl opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200">
        {text}
      </span>
    </span>
  );
}

function CheckRow({ label, desc, tooltip, active, isInfo }) {
  return (
    <Tip text={tooltip}>
      <div className={`flex items-start gap-3 rounded-lg px-4 py-3 w-full ${
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
    </Tip>
  );
}
