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
  const [portfolios, setPortfolios] = useState([]);
  const [activePid, setActivePid] = useState(null);

  // Load portfolio list on mount
  useEffect(() => {
    fetch('/api/portfolios').then(r => r.json()).then(pfs => {
      setPortfolios(pfs);
      const saved = typeof window !== 'undefined' && localStorage.getItem('activePid');
      const initial = (saved && pfs.some(p => p.id === saved)) ? saved : pfs[0]?.id || 'corolla';
      setActivePid(initial);
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (!activePid) return;
    try {
      const [pRes, cRes, sRes, nRes, aRes] = await Promise.all([
        fetch('/api/prices'),
        fetch(`/api/config?portfolio=${activePid}`),
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
  }, [activePid]);

  useEffect(() => {
    if (!activePid) return;
    setLoading(true);
    fetchData();
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, [fetchData, activePid]);

  function switchPortfolio(pid) {
    setActivePid(pid);
    if (typeof window !== 'undefined') localStorage.setItem('activePid', pid);
  }

  if (loading || !activePid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const coins = config?.coins || {};
  const hasActiveAlerts = status?.alerts?.length > 0;
  const activePortfolio = portfolios.find(p => p.id === activePid);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800/60 sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight">Emotionless Alerts</h1>
            {/* Portfolio Selector */}
            {portfolios.length > 1 && (
              <select
                value={activePid}
                onChange={(e) => switchPortfolio(e.target.value)}
                className="bg-zinc-800 border border-zinc-700/50 rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none focus:border-emerald-500"
              >
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700/50">
              Refresh
            </button>
            <Link href={`/transactions?portfolio=${activePid}`} className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700/50">
              Transactions
            </Link>
            <Link href={`/settings?portfolio=${activePid}`} className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700/50">
              Settings
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">{error}</div>
        )}

        {/* Portfolio Name Banner */}
        {activePortfolio && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-lg border border-emerald-500/20">
              {activePortfolio.name}
            </span>
            {activePortfolio.telegramChatId && (
              <span className="text-[10px] text-zinc-500">TG alerts on</span>
            )}
            {activePortfolio.alertEmail && (
              <span className="text-[10px] text-zinc-500">Email alerts on</span>
            )}
          </div>
        )}

        {/* Status Banner */}
        <div className={`rounded-xl p-4 text-center ${
          hasActiveAlerts
            ? 'bg-amber-500/10 border border-amber-500/30'
            : 'bg-emerald-500/5 border border-emerald-500/20'
        }`}>
          <p className={`text-sm font-semibold ${hasActiveAlerts ? 'text-amber-300' : 'text-emerald-400'}`}>
            {hasActiveAlerts
              ? `${status.alerts.length} alert(s) fired recently. Check below.`
              : 'All quiet. No action needed right now.'}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Bot checks prices every hour and sends alerts to each portfolio&apos;s Telegram + email when something needs attention.
          </p>
        </div>

        {/* Your Money */}
        {(() => {
          const totalCost = Object.values(coins).reduce((s, c) => s + (c.holdingsUsd || 0), 0);
          const totalCurrentValue = Object.entries(coins).reduce((s, [coin, cc]) => {
            const p = prices?.[coin];
            if (!p || !cc.avgCost || cc.avgCost === 0) return s;
            return s + (cc.holdingsUsd / cc.avgCost) * p;
          }, 0);
          const totalPnl = totalCurrentValue - totalCost;
          const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
          return (
            <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Your Money</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <Tip text="What all your crypto is worth right now at current market prices.">
                    <p className="text-xs text-zinc-500">Portfolio Value</p>
                  </Tip>
                  <p className="text-xl font-mono font-bold">{fmt(totalCurrentValue)}</p>
                </div>
                <div>
                  <Tip text="How much USD you spent buying all your crypto (your total cost basis).">
                    <p className="text-xs text-zinc-500">Total Cost</p>
                  </Tip>
                  <p className="text-lg font-mono font-bold text-zinc-400">{fmt(totalCost)}</p>
                </div>
                <div>
                  <Tip text={`Your overall profit or loss: current value (${fmt(totalCurrentValue)}) minus total cost (${fmt(totalCost)}).`}>
                    <p className="text-xs text-zinc-500">Total P&L</p>
                  </Tip>
                  <p className={`text-lg font-mono font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)} <span className="text-xs">({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(1)}%)</span>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 border-t border-zinc-800/50 pt-3">
                <div>
                  <Tip text="The total amount of money you've set aside for this portfolio.">
                    <p className="text-xs text-zinc-500">Total Budget</p>
                  </Tip>
                  <p className="text-sm font-mono font-bold">{fmt(config?.totalCapital)}</p>
                </div>
                <div>
                  <Tip text="Cash available for buying dips. Auto-calculated from your transactions.">
                    <p className="text-xs text-zinc-500">Cash Ready</p>
                  </Tip>
                  <p className="text-sm font-mono font-bold text-blue-400">{fmt(config?.powderRemaining)}</p>
                </div>
                <div>
                  <Tip text="Emergency reserve — only deployed after a deep crash + floor confirmation.">
                    <p className="text-xs text-zinc-500">Reserve</p>
                  </Tip>
                  <p className="text-sm font-mono font-bold text-amber-400">{fmt(config?.reserveRemaining)}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Coin Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.entries(coins).map(([coin, cc]) => {
            const price = prices?.[coin];
            if (!price) return null;
            const pnlPct = cc.avgCost ? ((price - cc.avgCost) / cc.avgCost) * 100 : 0;
            const totalCoins = cc.avgCost > 0 ? cc.holdingsUsd / cc.avgCost : 0;
            const currentValue = totalCoins * price;
            const pnlUsd = currentValue - cc.holdingsUsd;
            const buyAt = cc.buyReference * (1 - (config?.buyBandPct || 0.07));
            const buyDropPct = cc.buyReference > 0 ? ((cc.buyReference - buyAt) / cc.buyReference * 100).toFixed(0) : 7;
            const sellAt = cc.avgCost * (1 + (config?.firstSellPct || 0.4));
            const nearBuy = cc.buyReference > 0 && price <= buyAt;
            const nearSell = cc.avgCost > 0 && price >= sellAt;

            return (
              <div key={coin} className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
                {/* Header: coin name + price + P&L badge */}
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-xs text-zinc-500 font-medium">{coin}</p>
                    <p className="text-2xl font-mono font-bold mt-0.5">
                      {fmtPrice(price)}
                    </p>
                  </div>
                  {cc.avgCost > 0 && (
                    <Tip text={`Your profit/loss on ${coin}. You bought at avg ${fmtPrice(cc.avgCost)}, now ${fmtPrice(price)}. ${pnlPct >= 0 ? 'You are in profit.' : 'You are at a loss — normal during dips.'}`}>
                      <span className={`text-xs font-mono font-semibold px-2 py-1 rounded-md ${
                        pnlPct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                      </span>
                    </Tip>
                  )}
                </div>

                {/* Portfolio details — CoinGecko style */}
                <div className="space-y-2 text-sm">
                  {cc.avgCost > 0 && (
                    <>
                      <div className="flex justify-between">
                        <Tip text={`You own ${fmtCoinAmt(totalCoins)} ${coin}, bought at a weighted average of ${fmtPrice(cc.avgCost)} per coin.`}>
                          <span className="text-zinc-500">Holdings</span>
                        </Tip>
                        <span className="font-mono">{fmtCoinAmt(totalCoins)} {coin}</span>
                      </div>
                      <div className="flex justify-between">
                        <Tip text={`What your ${coin} position is worth right now at market price (${fmtPrice(price)} x ${fmtCoinAmt(totalCoins)}).`}>
                          <span className="text-zinc-500">Current value</span>
                        </Tip>
                        <span className="font-mono">{fmt(currentValue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <Tip text={`Your total cost basis — how much USD you spent buying this ${coin}.`}>
                          <span className="text-zinc-500">Total cost</span>
                        </Tip>
                        <span className="font-mono">{fmt(cc.holdingsUsd)}</span>
                      </div>
                      <div className="flex justify-between">
                        <Tip text={`The weighted average price of all your ${coin} buys.`}>
                          <span className="text-zinc-500">Avg cost</span>
                        </Tip>
                        <span className="font-mono">{fmtPrice(cc.avgCost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Profit / Loss</span>
                        <span className={`font-mono font-semibold ${pnlUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pnlUsd >= 0 ? '+' : ''}{fmt(pnlUsd)}
                        </span>
                      </div>
                    </>
                  )}

                  {/* Buy/Sell zones */}
                  {cc.buyReference > 0 && (
                    <div className="border-t border-zinc-800/50 pt-3 space-y-2">
                      <Tip text={nearBuy
                        ? `${coin} is in the BUY ZONE! Price is ${((cc.buyReference - price) / cc.buyReference * 100).toFixed(1)}% below your last buy at ${fmtPrice(cc.buyReference)}. Deploy your next rung of cash now.`
                        : `${coin} needs to drop to ${fmtPrice(buyAt)} (${buyDropPct}% below your last buy at ${fmtPrice(cc.buyReference)}) before you should buy more.`
                      }>
                        <div className={`flex justify-between items-center rounded-lg px-3 py-2 ${
                          nearBuy ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-zinc-800/30'
                        }`}>
                          <span className={`text-xs ${nearBuy ? 'text-blue-300 font-medium' : 'text-zinc-500'}`}>
                            {nearBuy ? 'BUY ZONE' : 'Next buy at'}
                          </span>
                          <span className={`font-mono text-xs ${nearBuy ? 'text-blue-300 font-bold' : 'text-zinc-400'}`}>
                            {fmtPrice(buyAt)}
                          </span>
                        </div>
                      </Tip>

                      {cc.avgCost > 0 && (
                        <Tip text={nearSell
                          ? `${coin} is in the SELL ZONE! Price is +${((price - cc.avgCost) / cc.avgCost * 100).toFixed(0)}% above your avg cost. Sell 15% to lock in profit.`
                          : `${coin} needs to rise to ${fmtPrice(sellAt)} (+${(config?.firstSellPct * 100).toFixed(0)}% above avg cost ${fmtPrice(cc.avgCost)}) before you take profit.`
                        }>
                          <div className={`flex justify-between items-center rounded-lg px-3 py-2 ${
                            nearSell ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-zinc-800/30'
                          }`}>
                            <span className={`text-xs ${nearSell ? 'text-orange-300 font-medium' : 'text-zinc-500'}`}>
                              {nearSell ? 'SELL ZONE — take 15% off' : 'First sell at'}
                            </span>
                            <span className={`font-mono text-xs ${nearSell ? 'text-orange-300 font-bold' : 'text-zinc-400'}`}>
                              {fmtPrice(sellAt)}
                            </span>
                          </div>
                        </Tip>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Safety Checks */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Safety Checks</h2>
          <p className="text-sm text-zinc-500 mb-4">These run automatically for each portfolio. You get alerts on your own Telegram + email.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <CheckRow
              label="Drawdown Warning"
              desc="Price drops -20%, -35%, or -50% from high"
              tooltip="Tracks how far each coin has fallen from its highest price. At -20%: keep buying dips. At -35% or -50%: STOP buying and wait for a floor."
              active={Object.keys(coins).some(c => status?.rules?.[`drawdown:${c}`])}
            />
            <CheckRow
              label="Floor Confirmed"
              desc="After a crash, holds above bottom for 2 weeks"
              tooltip="After a -35% or -50% crash, if the price closes above the lowest point for 2 consecutive weeks, the crash is likely over. This unlocks your Emergency Reserve."
              active={Object.keys(coins).some(c => status?.rules?.[`floorConfirmed:${c}`])}
            />
            <CheckRow
              label="Thesis Break"
              desc="BTC below 200-week MA for 2 weeks"
              tooltip="The 200-week moving average is BTC's long-term support line. If BTC closes below it for 2 weeks in a row, the bull thesis may be broken. Action: STOP all buying."
              active={status?.rules?.thesisBreak}
            />
            <CheckRow
              label="Upside Breakout"
              desc={`BTC weekly close above $${(config?.upsideBreakUsd || 90000).toLocaleString()}`}
              tooltip={`If BTC closes a week above $${(config?.upsideBreakUsd || 90000).toLocaleString()}, the downtrend is over. Action: deploy 40% of your remaining cash at market price immediately.`}
              active={status?.rules?.upsideBreak}
            />
            <CheckRow
              label="Monthly Review"
              desc="1st of each month position summary"
              tooltip="On the 1st of every month, you get a summary of all your positions, profit/loss, and remaining cash."
              active={false}
              isInfo
            />
          </div>
        </div>

        {/* 200-Week MA */}
        {status?.ma200 && (
          <Tip text="The 200-week moving average is the average BTC price over the last ~4 years. If BTC is above it, the long-term trend is healthy.">
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
            <p className="text-xs text-zinc-500 mb-3">High-impact news from the last 24 hours.</p>
            <div className="space-y-2">
              {news.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                   className="block bg-zinc-800/30 hover:bg-zinc-800/50 rounded-lg p-3 transition-colors">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm text-zinc-200">{a.title}</p>
                    <span className="text-[10px] text-zinc-500 shrink-0">{a.source}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">
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
          <p className="text-xs text-zinc-500 mb-3">Alerts sent to your Telegram + email. Same alert won&apos;t repeat until conditions change.</p>
          {!status?.alerts || status.alerts.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4 text-center">
              No alerts yet. Silence means do nothing — that&apos;s the right move most days.
            </p>
          ) : (
            <div className="space-y-2">
              {status.alerts.map((a, i) => (
                <div key={i} className="bg-zinc-800/30 rounded-lg p-3">
                  <p className="text-xs text-zinc-500">{new Date(a.time).toLocaleString()}</p>
                  <p className="text-sm text-zinc-200 mt-1 whitespace-pre-line">{a.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity Log */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Activity Log</h2>
          <p className="text-xs text-zinc-500 mb-3">Every hour, the bot checks prices across all portfolios.</p>
          {activity.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4 text-center">
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
                      <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">
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
          Alert-only. Never auto-trades. Checks prices every hour via cron-job.org.
        </footer>
      </main>
    </div>
  );
}

/* ---------- Helpers ---------- */

function fmt(n) {
  return n != null ? `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—';
}

function fmtPrice(n) {
  if (n == null) return '—';
  if (n < 0.01) return `$${Number(n).toFixed(6)}`;
  return n < 10 ? `$${n.toFixed(2)}` : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtCoinAmt(n) {
  if (n == null || n === 0) return '0';
  if (n >= 1000) return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.001) return n.toFixed(6);
  return n.toFixed(8);
}

function Tip({ text, children, block }) {
  const Tag = block ? 'div' : 'span';
  return (
    <Tag className={`relative group/tip ${block ? 'block' : 'inline-block'}`}>
      {children}
      <span className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 leading-relaxed shadow-xl opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200">
        {text}
      </span>
    </Tag>
  );
}

function CheckRow({ label, desc, tooltip, active, isInfo }) {
  return (
    <Tip text={tooltip} block>
      <div className={`flex items-center gap-3 rounded-lg px-4 py-3 h-full ${
        active ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-zinc-800/40 border border-zinc-800/60'
      }`}>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          active ? 'bg-amber-400 shadow-sm shadow-amber-400/50' : isInfo ? 'bg-zinc-600' : 'bg-emerald-600'
        }`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${active ? 'text-amber-300' : 'text-zinc-200'}`}>{label}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
        </div>
        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded shrink-0 ${
          active ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700/50 text-zinc-500'
        }`}>
          {active ? 'TRIGGERED' : 'quiet'}
        </span>
      </div>
    </Tip>
  );
}
