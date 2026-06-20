'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { COIN_COLORS, DEFAULT_COLOR, COIN_ICONS } from '@/lib/coins';
import { fmtUsd as fmt, fmtPrice, fmtCoinAmt } from '@/lib/format';
import BottomNav from '@/components/BottomNav';
import Tooltip from '@/components/Tooltip';

export default function Dashboard() {
  const [prices, setPrices] = useState(null);
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [news, setNews] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
  const [activePid, setActivePid] = useState(null);
  const [alertsSeenAt, setAlertsSeenAt] = useState(null);
  const [histPrices, setHistPrices] = useState(null);
  const [pnlPeriod, setPnlPeriod] = useState('all');

  useEffect(() => {
    fetch('/api/portfolios').then(r => r.json()).then(pfs => {
      setPortfolios(pfs);
      const saved = typeof window !== 'undefined' && localStorage.getItem('activePid');
      const initial = (saved && pfs.some(p => p.id === saved)) ? saved : pfs[0]?.id || 'corolla';
      setActivePid(initial);
    });
  }, []);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!activePid) return;
    if (isRefresh) setRefreshing(true);
    try {
      const [pRes, cRes, sRes, nRes, aRes, seenRes, hRes] = await Promise.all([
        fetch('/api/prices'),
        fetch(`/api/config?portfolio=${activePid}`),
        fetch(`/api/status?portfolio=${activePid}`),
        fetch('/api/news'),
        fetch('/api/activity'),
        fetch('/api/alerts-seen'),
        fetch('/api/prices/history'),
      ]);
      setPrices(await pRes.json());
      setConfig(await cRes.json());
      setStatus(await sRes.json());
      setNews(await nRes.json());
      setActivity(await aRes.json());
      const seenData = await seenRes.json();
      setAlertsSeenAt(seenData.seenAt);
      const hData = await hRes.json();
      if (!hData.error) setHistPrices(hData);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center animate-float">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <div className="absolute inset-0 w-12 h-12 rounded-2xl bg-emerald-500/20 animate-ping" />
        </div>
        <p className="text-[11px] text-zinc-600 font-medium tracking-wider uppercase">Loading portfolio</p>
      </div>
    );
  }

  const assets = config?.assets || [];
  const coins = config?.coins || {};
  const assetList = assets.length > 0 ? assets : Object.entries(coins).map(([sym, cc]) => ({ symbol: sym, ...cc, class: sym === 'AQUARI' ? 'microcap' : 'liquid', weight: 0.25 }));
  const hasActiveAlerts = status?.alerts?.length > 0;
  const activePortfolio = portfolios.find(p => p.id === activePid);
  const capital = config?.capital || config?.totalCapital || 0;
  const cash = config?.cash || config?.powderRemaining || 0;
  const portfolioValue = assetList.reduce((s, a) => {
    const p = prices?.[a.symbol];
    if (!p || !a.avgCost || a.avgCost === 0) return s;
    return s + (a.holdingsUsd / a.avgCost) * p;
  }, 0) + cash;
  const spendableCash = Math.max(0, cash - portfolioValue * 0.10);

  return (
    <div className="min-h-screen pb-24 sm:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-20 glass-strong border-b border-zinc-800/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 animate-glow">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <h1 className="text-sm font-bold tracking-tight hidden sm:block">Emotionless Alerts</h1>
            {portfolios.length > 1 && (
              <select
                value={activePid}
                onChange={(e) => switchPortfolio(e.target.value)}
                className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-emerald-500/40 cursor-pointer transition-colors"
              >
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
          <nav className="hidden sm:flex items-center gap-1.5">
            <button onClick={() => fetchData(true)} disabled={refreshing}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800/30 hover:bg-zinc-800/60 rounded-lg border border-zinc-700/20 transition-all cursor-pointer disabled:opacity-50">
              {refreshing ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border border-zinc-500 border-t-zinc-200 rounded-full animate-spin" />
                  Refreshing
                </span>
              ) : 'Refresh'}
            </button>
            <Link href={`/transactions?portfolio=${activePid}`} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800/30 hover:bg-zinc-800/60 rounded-lg border border-zinc-700/20 transition-all">
              Portfolio
            </Link>
            <Link href={`/settings?portfolio=${activePid}`} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800/30 hover:bg-zinc-800/60 rounded-lg border border-zinc-700/20 transition-all">
              Settings
            </Link>
          </nav>
          <button onClick={() => fetchData(true)} disabled={refreshing} aria-label="Refresh prices"
            className="sm:hidden p-2 text-zinc-400 active:text-zinc-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50">
            <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-4 sm:space-y-5">
        {error && (
          <div className="bg-red-500/8 border border-red-500/20 rounded-2xl p-4 text-sm text-red-300 animate-fade-up">{error}</div>
        )}

        {/* Status Banner */}
        <div className={`rounded-2xl p-4 sm:p-5 animate-fade-up ${
          hasActiveAlerts
            ? 'bg-amber-500/[0.06] border border-amber-500/20'
            : 'bg-emerald-500/[0.04] border border-emerald-500/10'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full shrink-0 animate-pulse-dot ${hasActiveAlerts ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <div>
              <p className={`text-sm font-semibold tracking-tight ${hasActiveAlerts ? 'text-amber-300' : 'text-emerald-400'}`}>
                {hasActiveAlerts
                  ? `${status.alerts.length} alert${status.alerts.length > 1 ? 's' : ''} fired recently`
                  : 'All quiet \u2014 no action needed'}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Prices checked hourly. Alerts go to {activePortfolio?.name || 'your'} Telegram + email.
              </p>
            </div>
          </div>
        </div>

        {/* Portfolio Value — Hero Card */}
        {(() => {
          const totalCost = assetList.reduce((s, a) => s + (a.holdingsUsd || 0), 0);
          const totalCurrentValue = assetList.reduce((s, a) => {
            const p = prices?.[a.symbol];
            if (!p || !a.avgCost || a.avgCost === 0) return s;
            return s + (a.holdingsUsd / a.avgCost) * p;
          }, 0);
          const totalPnl = totalCurrentValue - totalCost;
          const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

          // Period P&L: compare current portfolio value vs value at past prices
          let displayPnl = totalPnl;
          let displayPnlPct = totalPnlPct;
          if (pnlPeriod !== 'all' && histPrices?.[pnlPeriod]) {
            const pastPrices = histPrices[pnlPeriod];
            const pastAssetValue = assetList.reduce((s, a) => {
              const pastP = pastPrices[a.symbol];
              if (!pastP || !a.avgCost || a.avgCost === 0) return s;
              return s + (a.holdingsUsd / a.avgCost) * pastP;
            }, 0);
            const pastTotal = pastAssetValue + cash;
            displayPnl = (totalCurrentValue + cash) - pastTotal;
            displayPnlPct = pastTotal > 0 ? (displayPnl / pastTotal) * 100 : 0;
          }

          return (
            <div className="relative overflow-hidden glass rounded-3xl p-6 sm:p-7 animate-fade-up" style={{ animationDelay: '50ms' }}>
              {/* Decorative blurs */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/[0.06] rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-indigo-500/[0.04] rounded-full blur-3xl pointer-events-none" />

              <div className="relative">
                <div className="flex flex-wrap items-center gap-2 mb-5">
                  {activePortfolio && (
                    <span className="text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-lg border border-emerald-500/15 tracking-wider">
                      {activePortfolio.name}
                    </span>
                  )}
                  {activePortfolio?.telegramChatId && (
                    <Tooltip text="Telegram alerts are enabled for this portfolio.">
                      <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.67-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.49 1.02-.74 3.98-1.73 6.64-2.87 7.97-3.44 3.8-1.58 4.59-1.86 5.1-1.87.11 0 .37.03.53.17.14.12.18.28.2.45-.01.06.01.24 0 .38z"/></svg>
                        Telegram on
                      </span>
                    </Tooltip>
                  )}
                  {activePortfolio?.alertEmail && (
                    <Tooltip text="Email alerts are enabled for this portfolio.">
                      <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                        Email on
                      </span>
                    </Tooltip>
                  )}
                </div>

                {/* P&L Period Selector */}
                <div className="flex items-center gap-1.5 mb-5">
                  {[['all', 'All'], ['24h', '24H'], ['7d', '7D'], ['30d', '30D'], ['90d', '90D']].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setPnlPeriod(key)}
                      disabled={key !== 'all' && !histPrices?.[key]}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        pnlPeriod === key
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 border border-transparent'
                      } disabled:opacity-30 disabled:cursor-not-allowed`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="space-y-5 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-x-8 mb-6">
                  <div>
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Portfolio Value</p>
                    <p className="text-3xl sm:text-4xl font-mono font-bold mt-1.5 tabular-nums tracking-tighter">{fmt(totalCurrentValue)}</p>
                  </div>
                  <div className="flex gap-6 sm:block">
                    <div className="flex-1">
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Total Cost</p>
                      <p className="text-lg sm:text-xl font-mono font-bold text-zinc-400 mt-1.5 tabular-nums">{fmt(totalCost)}</p>
                    </div>
                    <div className="flex-1 sm:hidden">
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">{pnlPeriod === 'all' ? 'Profit / Loss' : `${pnlPeriod.toUpperCase()} P&L`}</p>
                      <p className={`text-lg font-mono font-bold mt-1.5 tabular-nums ${displayPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {displayPnl >= 0 ? '+' : ''}{fmt(displayPnl)}
                        <span className="text-[10px] ml-1 opacity-70">({displayPnlPct >= 0 ? '+' : ''}{displayPnlPct.toFixed(1)}%)</span>
                      </p>
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">{pnlPeriod === 'all' ? 'Total Profit / Loss' : `${pnlPeriod.toUpperCase()} Profit / Loss`}</p>
                    <p className={`text-xl font-mono font-bold mt-1.5 tabular-nums ${displayPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {displayPnl >= 0 ? '+' : ''}{fmt(displayPnl)}
                      <span className="text-xs ml-1 opacity-70">({displayPnlPct >= 0 ? '+' : ''}{displayPnlPct.toFixed(1)}%)</span>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 sm:gap-4 border-t border-zinc-700/20 pt-4">
                  <Tooltip text="Total capital allocated to this portfolio. All target weights are percentages of this number.">
                    <div>
                      <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Capital</p>
                      <p className="text-xs sm:text-sm font-mono font-bold mt-0.5 tabular-nums">{fmt(capital)}</p>
                    </div>
                  </Tooltip>
                  <Tooltip text="Total cash in this portfolio. 10% is always kept as a dry-powder floor.">
                    <div>
                      <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Cash</p>
                      <p className="text-xs sm:text-sm font-mono font-bold text-blue-400 mt-0.5 tabular-nums">{fmt(cash)}</p>
                    </div>
                  </Tooltip>
                  <Tooltip text="Cash above the 10% floor that can be spent on dip-buys. Floor keeps ammo for the next dip.">
                    <div>
                      <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Spendable</p>
                      <p className="text-xs sm:text-sm font-mono font-bold text-emerald-400 mt-0.5 tabular-nums">{fmt(spendableCash)}</p>
                    </div>
                  </Tooltip>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Dry-Powder Cash Card */}
        {(() => {
          const stablecoin = activePortfolio?.stablecoin || 'Cash';
          const floor = portfolioValue * 0.10;
          const spendable = Math.max(0, cash - floor);
          const cashPct = portfolioValue > 0 ? (cash / portfolioValue) * 100 : 0;
          const belowFloor = cash < floor;
          const floorPct = portfolioValue > 0 ? (floor / portfolioValue) * 100 : 10;
          const spendablePct = portfolioValue > 0 ? (spendable / portfolioValue) * 100 : 0;

          return (
            <div className={`glass rounded-2xl p-4 sm:p-5 relative overflow-hidden transition-all duration-300 ${
              belowFloor ? 'ring-1 ring-amber-500/30' : 'ring-1 ring-blue-500/15'
            }`}>
              {/* Subtle gradient background */}
              <div className={`absolute inset-0 opacity-[0.04] bg-gradient-to-br ${
                belowFloor ? 'from-amber-500 to-orange-600' : 'from-blue-500 to-cyan-500'
              } pointer-events-none`} />

              <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Left: Icon + Amount */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 ${
                    belowFloor
                      ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20'
                      : 'bg-gradient-to-br from-blue-500 to-cyan-600 shadow-blue-500/20'
                  }`}>
                    <span className="text-white text-sm font-bold">$</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium uppercase tracking-wider">{stablecoin} Cash Reserve</p>
                    <p className="text-lg sm:text-xl font-mono font-bold tabular-nums tracking-tight mt-0.5">
                      {fmt(cash)}
                      <span className="text-xs text-zinc-500 font-sans ml-2">{cashPct.toFixed(1)}% of portfolio</span>
                    </p>
                  </div>
                </div>

                {/* Right: Spendable vs Floor */}
                <div className="flex gap-3 sm:gap-5">
                  <Tooltip text="Cash above the 10% floor that you can deploy on dip-buys.">
                    <div className="text-right">
                      <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Spendable</p>
                      <p className={`text-sm sm:text-base font-mono font-bold tabular-nums mt-0.5 ${
                        spendable > 0 ? 'text-emerald-400' : 'text-amber-400'
                      }`}>{fmt(spendable)}</p>
                    </div>
                  </Tooltip>
                  <div className="w-px bg-zinc-700/30" />
                  <Tooltip text="10% of portfolio value is always reserved as a safety buffer. This cash won't be used for dip-buys.">
                    <div className="text-right">
                      <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">10% Floor</p>
                      <p className="text-sm sm:text-base font-mono font-bold text-zinc-400 tabular-nums mt-0.5">{fmt(floor)}</p>
                    </div>
                  </Tooltip>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3 relative">
                <div className="h-1.5 rounded-full bg-zinc-800/60 overflow-hidden">
                  {/* Floor portion */}
                  <div
                    className={`absolute h-full rounded-full ${belowFloor ? 'bg-amber-500/40' : 'bg-blue-500/30'}`}
                    style={{ width: `${Math.min(cashPct, 100)}%` }}
                  />
                  {/* Spendable portion (on top of floor) */}
                  {spendable > 0 && (
                    <div
                      className="absolute h-full rounded-full bg-emerald-500/60"
                      style={{ width: `${Math.min(spendablePct, 100)}%`, left: `${Math.min(floorPct, cashPct)}%` }}
                    />
                  )}
                </div>
                {/* Floor marker */}
                <div
                  className="absolute top-0 h-1.5 w-px bg-zinc-400/40"
                  style={{ left: `${Math.min(floorPct, 100)}%` }}
                />
              </div>

              {/* Warning when below floor */}
              {belowFloor && (
                <div className="mt-3 flex items-start gap-2 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
                  <span className="text-amber-400 text-xs mt-px flex-shrink-0">&#9888;</span>
                  <p className="text-[11px] sm:text-xs text-amber-400/80 leading-relaxed">
                    Below 10% floor — no dip-buys until funded or a trim frees cash.
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Asset Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {assetList.map((asset, idx) => {
            const coin = asset.symbol;
            const cc = asset;
            const price = prices?.[coin];
            if (!price) return null;
            const colors = COIN_COLORS[coin] || DEFAULT_COLOR;
            const pnlPct = cc.avgCost ? ((price - cc.avgCost) / cc.avgCost) * 100 : 0;
            const totalCoins = cc.avgCost > 0 ? cc.holdingsUsd / cc.avgCost : 0;
            const currentValue = totalCoins * price;
            const pnlUsd = currentValue - cc.holdingsUsd;

            // Period-specific P&L for this card
            let cardPnlPct = pnlPct;
            let cardPnlUsd = pnlUsd;
            if (pnlPeriod !== 'all' && histPrices?.[pnlPeriod]?.[coin]) {
              const pastPrice = histPrices[pnlPeriod][coin];
              const pastValue = totalCoins * pastPrice;
              cardPnlUsd = currentValue - pastValue;
              cardPnlPct = pastPrice > 0 ? ((price - pastPrice) / pastPrice) * 100 : 0;
            }

            const weight = asset.weight || (1 / assetList.filter(a => a.class === 'liquid').length);
            const targetVal = weight * capital;
            const deviation = targetVal > 0 ? (currentValue - targetVal) / targetVal : 0;
            const nearBuy = deviation <= -0.10 && cc.holdingsUsd >= 0;
            const lastAction = asset.lastActionPrice || cc.avgCost || 0;
            const skimGain = lastAction > 0 ? (price - lastAction) / lastAction : 0;
            const nearSell = cc.avgCost > 0 && price > cc.avgCost && skimGain >= 0.20;

            return (
              <Link key={coin} href={`/coin/${coin.toLowerCase()}?portfolio=${activePid}`}
                className={`group block glass rounded-2xl p-4 sm:p-5 hover:bg-zinc-800/40 hover:shadow-lg hover:${colors.glow} hover:ring-1 ${colors.ring} relative transition-all duration-300 animate-fade-up`}
                style={{ animationDelay: `${100 + idx * 60}ms` }}
              >
                {/* Header with coin avatar */}
                <div className="flex justify-between items-start mb-3 sm:mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg ${colors.glow} group-hover:scale-105 transition-transform duration-300`}>
                      <span className="text-white text-xs font-bold">{COIN_ICONS[coin] || '?'}</span>
                    </div>
                    <div>
                      <span className={`text-xs font-bold ${colors.label}`}>{coin}</span>
                      <p className="text-lg font-mono font-bold tabular-nums tracking-tight mt-0.5">{fmtPrice(price)}</p>
                    </div>
                  </div>
                  {cc.avgCost > 0 && (
                    <Tooltip text={pnlPeriod === 'all' ? `Unrealized profit/loss since your avg cost of ${fmtPrice(cc.avgCost)}.` : `${pnlPeriod.toUpperCase()} price change for ${coin}.`}>
                      <span className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-lg ${
                        cardPnlPct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {pnlPeriod === 'all' ? 'P&L' : pnlPeriod.toUpperCase()} {cardPnlPct >= 0 ? '+' : ''}{cardPnlPct.toFixed(1)}%
                      </span>
                    </Tooltip>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-1 sm:space-y-1.5 text-sm">
                  {cc.avgCost > 0 ? (
                    <>
                      <Row label="Holdings">
                        <span className="font-mono tabular-nums">{fmtCoinAmt(totalCoins)} <span className="text-zinc-500 text-[10px]">{coin}</span></span>
                      </Row>
                      <Row label="Value">
                        <span className="font-mono tabular-nums">{fmt(currentValue)}</span>
                      </Row>
                      <Row label="Cost">
                        <span className="font-mono tabular-nums text-zinc-400">{fmt(cc.holdingsUsd)}</span>
                      </Row>
                      <Row label={pnlPeriod === 'all' ? 'Profit / Loss' : `${pnlPeriod.toUpperCase()} P&L`}>
                        <span className={`font-mono font-semibold tabular-nums ${cardPnlUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {cardPnlUsd >= 0 ? '+' : ''}{fmt(cardPnlUsd)}
                        </span>
                      </Row>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-600 py-2">Price tracking only &mdash; no position</p>
                  )}

                  {/* Buy/Sell Zones */}
                  {(weight > 0 || cc.avgCost > 0) && (
                    <div className="border-t border-zinc-700/20 pt-2.5 mt-2.5 space-y-1.5">
                      {weight > 0 && targetVal > 0 && (
                        <Tooltip block text={(() => {
                          const gap = Math.max(targetVal - currentValue, 0);
                          const buyAmount = Math.min(gap, spendableCash);
                          const coinsToBuy = price > 0 ? buyAmount / price : 0;
                          const deviationPct = (deviation * 100).toFixed(1);
                          const newCoins = totalCoins + coinsToBuy;
                          const newHoldings = cc.holdingsUsd + buyAmount;
                          const newAvg = newCoins > 0 ? newHoldings / newCoins : price;
                          return `Buy when ${coin} drifts >=10% below its target weight\n\nTarget: ${fmt(targetVal)} (${(weight * 100).toFixed(0)}% of ${fmt(capital)})\nCurrent value: ${fmt(currentValue)}\nDeviation: ${deviationPct}%${deviation <= -0.10 ? ' \u2014 BUY ZONE' : ' \u2014 within range'}\n\nIf buying now:\nSpend ${fmt(buyAmount)} to close the gap\nGet ~${fmtCoinAmt(coinsToBuy)} ${coin}\nNew avg cost: ${fmtPrice(newAvg)}\nSpendable cash left: ${fmt(Math.max(spendableCash - buyAmount, 0))}`;
                        })()}>
                          <div className={`flex justify-between items-center gap-2 rounded-xl px-3 py-2 transition-all duration-200 ${
                            nearBuy ? 'bg-blue-500/8 border border-blue-500/20' : 'bg-zinc-800/20 border border-transparent'
                          }`}>
                            <span className={`text-[11px] font-medium whitespace-nowrap ${nearBuy ? 'text-blue-300' : 'text-zinc-500'}`}>
                              {nearBuy ? 'BUY ZONE' : 'Target alloc.'}
                            </span>
                            <span className={`font-mono text-[11px] tabular-nums ${nearBuy ? 'text-blue-300 font-bold' : 'text-zinc-500'}`}>
                              {fmt(targetVal)} ({(deviation * 100).toFixed(1)}% {deviation < 0 ? 'below' : 'above'})
                            </span>
                          </div>
                        </Tooltip>
                      )}

                      {cc.avgCost > 0 && (
                        <Tooltip block text={(() => {
                          const skimTriggerPrice = lastAction * 1.20;
                          const skimValue = currentValue * 0.05;
                          const skimCoins = price > 0 ? skimValue / price : 0;
                          const gainPct = (skimGain * 100).toFixed(1);
                          return `Take profit: sell 5% when ${coin} rises >=20% from last action AND is above avg cost\n\nLast action: ${fmtPrice(lastAction)}\nTrigger price: ${fmtPrice(skimTriggerPrice)}\nAvg cost: ${fmtPrice(cc.avgCost)}\nPrice now: ${fmtPrice(price)} (${gainPct}% from last action)${nearSell ? ' \u2014 TAKE PROFIT' : ' \u2014 not there yet'}\n\nIf taking profit now:\nSell ${fmtCoinAmt(skimCoins)} ${coin} (5% of position)\nProceeds: ~${fmt(skimValue)}\nRemaining 95% keeps riding`;
                        })()}>
                          <div className={`flex justify-between items-center gap-2 rounded-xl px-3 py-2 transition-all duration-200 ${
                            nearSell ? 'bg-orange-500/8 border border-orange-500/20' : 'bg-zinc-800/20 border border-transparent'
                          }`}>
                            <span className={`text-[11px] font-medium whitespace-nowrap ${nearSell ? 'text-orange-300' : 'text-zinc-500'}`}>
                              {nearSell ? 'TAKE PROFIT' : 'Take profit at'}
                            </span>
                            <span className={`font-mono text-[11px] tabular-nums ${nearSell ? 'text-orange-300 font-bold' : 'text-zinc-500'}`}>
                              {fmtPrice(lastAction * 1.20)}
                            </span>
                          </div>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Safety Checks */}
        <div className="glass rounded-2xl p-4 sm:p-5 animate-fade-up" style={{ animationDelay: '200ms' }}>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Safety Checks</h2>
          <p className="text-[11px] text-zinc-600 mt-0.5 mb-3 sm:mb-4">Automated monitoring across all portfolios</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Tooltip block text="10% of portfolio value is always kept as cash. When cash drops below this floor, buy signals are capped or suppressed to preserve dry powder for the next dip.">
              <CheckRow label="Cash Floor" desc="10% of portfolio kept as dry powder" active={cash < portfolioValue * 0.10} />
            </Tooltip>
            <Tooltip block text="When an asset drifts >=10% below its target weight, a buy signal fires. The gap is filled using spendable cash (cash above the 10% floor).">
              <CheckRow label="Active Buy Signals" desc="Assets >=10% below target weight"
                active={assetList.some(a => {
                  const p = prices?.[a.symbol];
                  if (!p || !a.avgCost || a.avgCost === 0) return false;
                  const cv = (a.holdingsUsd / a.avgCost) * p;
                  const tv = (a.weight || 0) * capital;
                  return tv > 0 && (cv - tv) / tv <= -0.10;
                })}
              />
            </Tooltip>
            <Tooltip block text="If BTC closes below the 200-week moving average for 2 consecutive weeks, half of each crypto target shifts to gold + cash. Re-risks when BTC recovers above the MA. Optional \u2014 off by default.">
              <CheckRow label="Crash Brake" desc="BTC below 200-week MA for 2 weeks" active={status?.rules?.crashBrakeActive} />
            </Tooltip>
            <Tooltip block text="Every 1st of the month, you get a summary of all your assets, P&L, and portfolio balance. Just a monthly check-in.">
              <CheckRow label="Monthly Review" desc="1st of each month summary" active={false} isInfo />
            </Tooltip>
          </div>
        </div>

        {/* 200-Week MA */}
        {status?.ma200 && (
          <Tooltip block text="The 200-week moving average is a long-term trend indicator. When BTC trades above it, the market trend is considered healthy. Dropping below it has historically signaled extended downturns. The Crash Brake uses this to decide whether to de-risk.">
            <div className="glass rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-up" style={{ animationDelay: '250ms' }}>
              <div>
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">BTC 200-Week Moving Average</p>
                <p className="text-xl sm:text-2xl font-mono font-bold mt-1 tabular-nums tracking-tight">{'$'}{Math.round(status.ma200).toLocaleString()}</p>
              </div>
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-lg w-fit ${
                (prices?.BTC || 0) > status.ma200
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                  : 'bg-red-500/10 text-red-400 border border-red-500/15'
              }`}>
                BTC is {(prices?.BTC || 0) > status.ma200 ? 'above' : 'below'} {'\u2014'} {(prices?.BTC || 0) > status.ma200 ? 'healthy' : 'caution'}
              </span>
            </div>
          </Tooltip>
        )}

        {/* Market News */}
        {news.length > 0 && (
          <div className="glass rounded-2xl p-4 sm:p-5 animate-fade-up" style={{ animationDelay: '300ms' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Market News</h2>
              {news.some(a => a.direction) && (
                <Tooltip text="Sentiment and coin relevance detected by AI analysis of each headline.">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/15">AI</span>
                </Tooltip>
              )}
            </div>
            <p className="text-[11px] text-zinc-600 mt-0.5 mb-3 sm:mb-4">{news.some(a => a.direction) ? 'AI-filtered for your portfolio' : 'High-impact headlines, last 24h'}</p>
            <div className="space-y-2">
              {news.map((a, i) => {
                const hasAI = a.direction && a.insight;
                const dirColor = a.direction === 'bullish' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15'
                  : a.direction === 'bearish' ? 'text-red-400 bg-red-500/10 border-red-500/15'
                  : 'text-zinc-400 bg-zinc-700/20 border-zinc-700/30';
                const arrow = a.direction === 'bullish' ? '\u2197' : a.direction === 'bearish' ? '\u2198' : '\u2192';
                return (
                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                     className="block bg-zinc-800/20 hover:bg-zinc-800/40 rounded-xl p-3.5 transition-all duration-200 group">
                    <p className="text-[13px] sm:text-sm text-zinc-200 group-hover:text-zinc-100 transition-colors leading-snug">{a.title}</p>
                    {hasAI && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${dirColor}`}>{arrow} {a.direction}</span>
                        {a.coins?.map((c) => (
                          <span key={c} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${COIN_COLORS[c]?.badge || 'bg-zinc-700/20 text-zinc-400 border border-zinc-700/30'}`}>{c}</span>
                        ))}
                      </div>
                    )}
                    {hasAI && a.insight && (
                      <p className="text-[11px] text-zinc-400 mt-1.5 leading-snug">{a.insight}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-zinc-600 bg-zinc-800/60 px-1.5 py-0.5 rounded">{a.source}</span>
                      <span className="text-[10px] text-zinc-700">{new Date(a.published).toLocaleString()}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Alerts */}
        <div className="glass rounded-2xl p-4 sm:p-5 animate-fade-up" style={{ animationDelay: '350ms' }}>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Recent Alerts</h2>
          <p className="text-[11px] text-zinc-600 mt-0.5 mb-3 sm:mb-4">Same alert won&apos;t repeat until conditions change</p>
          {!status?.alerts || status.alerts.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-zinc-800/40 flex items-center justify-center">
                <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <p className="text-zinc-500 text-sm">No alerts yet</p>
              <p className="text-zinc-600 text-xs mt-1">Silence = do nothing. That&apos;s usually right.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {status.alerts.map((a, i) => (
                <div key={i} className="bg-zinc-800/20 rounded-xl p-3.5 border-l-2 border-amber-500/30">
                  <p className="text-[10px] text-zinc-600 font-mono">{new Date(a.time).toLocaleString()}</p>
                  <p className="text-[13px] sm:text-sm text-zinc-200 mt-1.5 whitespace-pre-line leading-relaxed">{a.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity Log */}
        <div className="glass rounded-2xl p-4 sm:p-5 animate-fade-up" style={{ animationDelay: '400ms' }}>
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div>
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Activity Log</h2>
              <p className="text-[11px] text-zinc-600 mt-0.5">Hourly price checks across all portfolios</p>
            </div>
            {(() => {
              const unseenAlerts = activity.filter(e => e.alertCount > 0 && (!alertsSeenAt || new Date(e.time) > new Date(alertsSeenAt)));
              if (unseenAlerts.length === 0) return null;
              return (
                <button
                  onClick={async () => {
                    const res = await fetch('/api/alerts-seen', { method: 'POST' });
                    const data = await res.json();
                    setAlertsSeenAt(data.seenAt);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/8 hover:bg-amber-500/15 border border-amber-500/20 rounded-lg text-[10px] sm:text-[11px] font-medium text-amber-300 transition-colors cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-dot" />
                  {unseenAlerts.length} new
                </button>
              );
            })()}
          </div>
          {activity.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-zinc-800/40 flex items-center justify-center">
                <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <p className="text-zinc-500 text-sm">No activity yet</p>
              <p className="text-zinc-600 text-xs mt-1">First check happens on next cron run.</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-72 sm:max-h-80 overflow-y-auto pr-1">
              {activity.slice(0, 48).map((entry, i) => {
                const isUnseen = entry.alertCount > 0 && (!alertsSeenAt || new Date(entry.time) > new Date(alertsSeenAt));
                return (
                <div key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  isUnseen ? 'bg-amber-500/5 border border-amber-500/15' : 'bg-zinc-800/15 hover:bg-zinc-800/25'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isUnseen ? 'bg-amber-400 animate-pulse-dot' : entry.alertCount > 0 ? 'bg-amber-400' : 'bg-emerald-500/60'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="text-[10px] sm:text-[11px] text-zinc-500 font-mono">{new Date(entry.time).toLocaleString()}</span>
                      <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded ${
                        entry.alertCount > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-700/30 text-zinc-500'
                      }`}>{entry.summary}</span>
                    </div>
                    {entry.prices && (
                      <p className="text-[9px] sm:text-[10px] text-zinc-600 mt-0.5 font-mono tabular-nums truncate">
                        {Object.entries(entry.prices).map(([c, p]) => p ? `${c}: $${Number(p).toLocaleString()}` : null).filter(Boolean).join(' \u00b7 ')}
                      </p>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* KV Warning */}
        {status && !status.kvConfigured && (
          <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-4 text-sm text-amber-300/80">
            <strong>Database not connected.</strong> Settings won&apos;t persist. Add Upstash Redis credentials in Vercel.
          </div>
        )}

        <footer className="text-center text-[11px] text-zinc-700 pt-4 pb-6 sm:pb-8">
          Alert-only. Never auto-trades. Prices checked hourly.
        </footer>
      </main>

      <BottomNav active="dashboard" portfolioId={activePid} />
    </div>
  );
}

/* ---------- Helpers ---------- */

function Row({ label, children }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-zinc-500 text-[11px]">{label}</span>
      <span className="text-[13px] sm:text-sm">{children}</span>
    </div>
  );
}

function CheckRow({ label, desc, active, isInfo }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 h-full transition-all duration-200 ${
      active ? 'bg-amber-500/[0.06] border border-amber-500/20' : 'bg-zinc-800/20 border border-zinc-800/30 hover:bg-zinc-800/30'
    }`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${
        active ? 'bg-amber-400 animate-pulse-dot' : isInfo ? 'bg-zinc-600' : 'bg-emerald-500/60'
      }`} />
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] sm:text-sm font-semibold tracking-tight ${active ? 'text-amber-300' : 'text-zinc-200'}`}>{label}</p>
        <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-0.5">{desc}</p>
      </div>
      <span className={`text-[9px] sm:text-[10px] font-bold uppercase px-1.5 sm:px-2 py-0.5 rounded-md shrink-0 tracking-wider ${
        active ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-700/30 text-zinc-600'
      }`}>
        {active ? 'ACTIVE' : 'OK'}
      </span>
    </div>
  );
}
