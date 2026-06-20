import * as store from './store.js';

async function wasAlerted(key) {
  return !!(await store.get(`alerted:${key}`));
}
async function markAlerted(key) {
  await store.set(`alerted:${key}`, true);
}
async function clearAlerted(key) {
  await store.set(`alerted:${key}`, false);
}

function fmtUsd(n) {
  const v = Number(n);
  if (v < 0.001) return `$${v.toFixed(8)}`;
  if (v < 0.01) return `$${v.toFixed(6)}`;
  if (v < 1) return `$${v.toFixed(4)}`;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCoin(n) {
  const v = Number(n);
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.001) return v.toFixed(6);
  return v.toFixed(8);
}

const DEFAULT_RUNG_SIZES = [400, 600, 700, 800];

async function nextRung(pid, coin, config) {
  const rungSizes = config.rungSizes || DEFAULT_RUNG_SIZES;
  const filled = (await store.get(`rungsFilled:${pid}:${coin}`)) || 0;
  if (filled >= rungSizes.length) return null;
  return { amount: rungSizes[filled], rung: filled + 1, filled, rungSizes };
}

async function advanceRung(pid, coin) {
  const filled = (await store.get(`rungsFilled:${pid}:${coin}`)) || 0;
  await store.set(`rungsFilled:${pid}:${coin}`, filled + 1);
}

function tag(portfolioName) {
  return `[${portfolioName}]`;
}

// 1. Buy band — price drops 7%+ below buyReference
// Safety guards: thesisStop, pause zone, per-coin cap (I2), total cap (I1)
export async function checkBuyBand(coin, price, config, pid, pName) {
  const cc = config.coins[coin];
  const ref = cc.buyReference;
  const threshold = ref * (1 - config.buyBandPct);
  const key = `${pid}:buyBand:${coin}`;

  // Guard: thesis stop — no buying when BTC is below 200wMA
  const thesisStop = await store.get(`thesisStop:${pid}`);
  if (thesisStop) return null;

  // Guard: pause zone — no buying when dd is between -35% and -50%
  const drawdownZone = await store.get(`drawdownZone:${pid}:${coin}`);
  if (drawdownZone === '35') return null;

  // Get next rung — returns null if all rungs filled
  const rung = await nextRung(pid, coin, config);
  if (!rung) return null;
  const deploy = rung.amount;

  // Guard: per-coin cap (I2) — don't exceed $5,000 deployed per coin
  const perCoinCap = config.perCoinCap || 5000;
  const deployed = cc.holdingsUsd || 0;
  if (deployed + deploy > perCoinCap) return null;

  // Guard: total cap (I1) — don't exceed totalCapital
  const totalDeployed = Object.values(config.coins).reduce((s, c) => s + (c.holdingsUsd || 0), 0);
  const totalCapital = config.totalCapital || 15000;
  if (totalDeployed + deploy + (config.reserveRemaining || 0) > totalCapital) return null;

  if (price <= threshold) {
    if (!(await wasAlerted(key))) {
      await markAlerted(key);
      await advanceRung(pid, coin);
      const coinsToBuy = deploy / price;
      const actualDrop = ((ref - price) / ref * 100).toFixed(1);
      const newAvg = cc.holdingsUsd > 0
        ? ((cc.holdingsUsd + deploy) / ((cc.holdingsUsd / cc.avgCost) + coinsToBuy))
        : price;
      return [
        `${tag(pName)} 🟢 BUY ${coin} NOW — Rung ${rung.rung} of ${rung.rungSizes.length}`,
        ``,
        `Price: ${fmtUsd(price)} (down ${actualDrop}% from your last buy at ${fmtUsd(ref)} — crossed the ${(config.buyBandPct * 100).toFixed(0)}% buy-band trigger)`,
        ``,
        `What to do:`,
        `  1. Buy ${fmtCoin(coinsToBuy)} ${coin} at ${fmtUsd(price)}`,
        `  2. Spend: ${fmtUsd(deploy)} (rung ${rung.rung}: $${rung.rungSizes.join(' → $')})`,
        `  3. After buying, your new avg cost will be ~${fmtUsd(newAvg)}`,
        `  4. Go to the Transactions page and log this buy`,
        ``,
        `Cash remaining after this buy: ${fmtUsd((config.powderRemaining || 0) - deploy)}`,
      ].join('\n');
    }
  } else {
    await clearAlerted(key);
  }
  return null;
}

// 2. Sell system — baseline lock, trims, trailing stop
// All thresholds from config (I10)
export async function checkSellTrigger(coin, price, config, pid, pName) {
  const cc = config.coins[coin];
  const avgCost = cc.avgCost;
  if (!avgCost || avgCost === 0) return null;

  const totalCoins = cc.holdingsUsd / avgCost;
  const trimPct = config.sellTrimPct || 0.15;
  const trimMultiples = config.trimMultiples || [2.0, 3.0, 4.0];
  const tsDropPct = config.trailingStopPct || 0.30;
  const tsSellPct = config.trailingStopSellPct || 0.25;

  // --- Baseline lock: first time price >= avgCost × first multiple, lock units ---
  let baseline = await store.get(`sellBaseline:${pid}:${coin}`);
  if (!baseline && price >= avgCost * trimMultiples[0]) {
    baseline = totalCoins;
    await store.set(`sellBaseline:${pid}:${coin}`, baseline);
  }

  // --- Trailing stop: track peak once baseline is set ---
  if (baseline) {
    let peak = (await store.get(`peakSinceGreen:${pid}:${coin}`)) || price;
    if (price > peak) {
      peak = price;
      await store.set(`peakSinceGreen:${pid}:${coin}`, peak);
    }

    if (price <= peak * (1 - tsDropPct)) {
      const tsKey = `${pid}:trailingStop:${coin}:${peak}`;
      if (!(await wasAlerted(tsKey))) {
        await markAlerted(tsKey);
        await store.set(`peakSinceGreen:${pid}:${coin}`, price);
        const remaining = totalCoins;
        const sellAmount = remaining * tsSellPct;
        const sellValue = sellAmount * price;
        const dropPctLabel = (tsDropPct * 100).toFixed(0);
        const sellPctLabel = (tsSellPct * 100).toFixed(0);
        return [
          `${tag(pName)} 🔻 TRAILING STOP: Sell ${sellPctLabel}% of ${coin}`,
          ``,
          `Price: ${fmtUsd(price)} (dropped ${dropPctLabel}%+ from peak of ${fmtUsd(peak)})`,
          ``,
          `What to do:`,
          `  1. Sell ${fmtCoin(sellAmount)} ${coin} at ${fmtUsd(price)}`,
          `  2. You'll receive: ${fmtUsd(sellValue)}`,
          `  3. Keep the remaining ${100 - Number(sellPctLabel)}% — this is a ladder-out, not a dump`,
          `  4. Go to the Transactions page and log this sell`,
          ``,
          `Peak has been reset to ${fmtUsd(price)}. If it drops another ${dropPctLabel}%, you'll sell another ${sellPctLabel}%.`,
        ].join('\n');
      }
    }
  }

  // --- Trim ladder: trimPct of baseline at each multiple of avgCost ---
  if (!baseline) return null;

  const trimsDone = (await store.get(`trimsDone:${pid}:${coin}`)) || 0;
  if (trimsDone >= trimMultiples.length) return null;

  const trimTarget = avgCost * trimMultiples[trimsDone];
  if (price < trimTarget) return null;

  const trimKey = `${pid}:trim:${coin}:${trimsDone}`;
  if (await wasAlerted(trimKey)) return null;
  await markAlerted(trimKey);
  await store.set(`trimsDone:${pid}:${coin}`, trimsDone + 1);

  const coinsToSell = baseline * trimPct;
  const sellValue = coinsToSell * price;
  const profit = sellValue - (coinsToSell * avgCost);
  const pctAbove = ((price - avgCost) / avgCost * 100).toFixed(0);
  const nextTrim = trimsDone + 1 < trimMultiples.length
    ? `Next trim at ${fmtUsd(avgCost * trimMultiples[trimsDone + 1])} (${trimMultiples[trimsDone + 1]}x avg cost)`
    : 'This was the final trim. Remaining coins ride the trend.';

  return [
    `${tag(pName)} 🔴 SELL ${(trimPct * 100).toFixed(0)}% of ${coin} — Trim ${trimsDone + 1} of ${trimMultiples.length}`,
    ``,
    `Price: ${fmtUsd(price)} (+${pctAbove}% above your avg cost of ${fmtUsd(avgCost)})`,
    ``,
    `What to do:`,
    `  1. Sell ${fmtCoin(coinsToSell)} ${coin} at ${fmtUsd(price)}`,
    `  2. You'll receive: ${fmtUsd(sellValue)}`,
    `  3. Profit on this trim: ~${fmtUsd(profit)}`,
    `  4. Go to the Transactions page and log this sell`,
    ``,
    nextTrim,
  ].join('\n');
}

// 3. Drawdown zone — price crosses into -20%, -35%, -50% band vs cycle high
// dd = price/cycleHigh − 1 (negative when price is below high)
// cycleHigh = trailing 365-day max (maintained in cron, not bumped here)
export async function checkDrawdownZone(coin, price, config, pid, pName) {
  const cycleHigh = (await store.get(`cycleHigh:${coin}`)) || 0;
  if (cycleHigh === 0) return null;
  const dd = price / cycleHigh - 1; // negative when price < high

  const zones = config.drawdownZones || [-0.20, -0.35, -0.50];

  let zone = null;
  let action = '';
  if (dd <= zones[2]) {
    zone = '50';
    action = [
      `${tag(pName)} ⚠️ ${coin} CRASH: ${(dd * 100).toFixed(0)}% from high`,
      ``,
      `${coin} dropped from ${fmtUsd(cycleHigh)} to ${fmtUsd(price)} — a 50%+ crash.`,
      ``,
      `What to do:`,
      `  1. STOP buying — do NOT deploy more cash`,
      `  2. HOLD what you have — do NOT panic sell`,
      `  3. Wait for FLOOR CONFIRMATION (2 weekly closes above the bottom)`,
      `  4. Your emergency reserve will unlock when floor confirms`,
    ].join('\n');
  } else if (dd <= zones[1]) {
    zone = '35';
    action = [
      `${tag(pName)} ⚠️ ${coin} DEEP DIP: ${(dd * 100).toFixed(0)}% from high`,
      ``,
      `${coin} dropped from ${fmtUsd(cycleHigh)} to ${fmtUsd(price)} — a 35%+ drawdown.`,
      ``,
      `What to do:`,
      `  1. STOP buying — save your cash for lower`,
      `  2. HOLD what you have`,
      `  3. Wait for floor confirmation before buying more`,
    ].join('\n');
  } else if (dd <= zones[0]) {
    zone = '20';
    action = [
      `${tag(pName)} ⚡ ${coin} DIP: ${(dd * 100).toFixed(0)}% from high`,
      ``,
      `${coin} dropped from ${fmtUsd(cycleHigh)} to ${fmtUsd(price)} — a 20%+ dip.`,
      ``,
      `What to do:`,
      `  1. Keep buying if Buy Zone triggers — this is normal`,
      `  2. Don't panic — 20% dips happen multiple times per cycle`,
    ].join('\n');
  }

  const prevZone = await store.get(`drawdownZone:${pid}:${coin}`);
  await store.set(`drawdownZone:${pid}:${coin}`, zone);

  if (zone && zone !== prevZone) {
    return action;
  }
  return null;
}

// 4. Floor confirmed — 2 consecutive weekly closes > lowest, while in -35/-50 zone
export async function checkFloorConfirmed(coin, weeklyCloses, config, pid, pName) {
  if (!weeklyCloses || weeklyCloses.length < 3) return null;
  const zone = await store.get(`drawdownZone:${pid}:${coin}`);
  if (zone !== '35' && zone !== '50') return null;

  const lowest = Math.min(...weeklyCloses);
  const last2 = weeklyCloses.slice(-2);
  if (last2[0] > lowest && last2[1] > lowest) {
    const key = `${pid}:floorConfirmed:${coin}`;
    if (!(await wasAlerted(key))) {
      await markAlerted(key);
      const reserve = config?.reserveRemaining || 0;
      const currentPrice = last2[1];
      const coinsToBuy = reserve > 0 ? reserve / currentPrice : 0;
      return [
        `${tag(pName)} 🟢 FLOOR CONFIRMED: ${coin}`,
        ``,
        `${coin} held above the bottom (${fmtUsd(lowest)}) for 2 consecutive weeks.`,
        `The crash is likely over — your emergency reserve is now unlocked.`,
        ``,
        `What to do:`,
        `  1. Deploy your emergency reserve: ${fmtUsd(reserve)}`,
        `  2. Buy ${fmtCoin(coinsToBuy)} ${coin} at current price ~${fmtUsd(currentPrice)}`,
        `  3. Log the transaction in the Transactions page`,
        `  4. Resume normal buying when Buy Zone triggers`,
      ].join('\n');
    }
  }
  return null;
}

// 5. Thesis break — BTC 2 weekly closes below 200-week MA
// Sets persistent thesisStop flag; clears on 1 weekly close above MA
export async function checkThesisBreak(btcWeeklyCloses, ma200, pid, pName) {
  if (!btcWeeklyCloses || btcWeeklyCloses.length < 2 || !ma200) return null;
  const last2 = btcWeeklyCloses.slice(-2);
  const key = `${pid}:thesisBreak`;
  if (last2[0] < ma200 && last2[1] < ma200) {
    // Set persistent flag so buy rung can check it
    await store.set(`thesisStop:${pid}`, true);
    if (!(await wasAlerted(key))) {
      await markAlerted(key);
      return [
        `${tag(pName)} 🚨 THESIS BREAK: BTC below 200-week MA`,
        ``,
        `BTC closed below the 200-week moving average (${fmtUsd(ma200)}) for 2 weeks in a row.`,
        `This is extremely rare and means the long-term bull trend may be broken.`,
        ``,
        `What to do:`,
        `  1. STOP all buying immediately — cancel any pending orders`,
        `  2. HOLD what you have — do NOT sell`,
        `  3. Do NOT deploy any more cash`,
        `  4. Wait for BTC to close 1 week back above ${fmtUsd(ma200)} to resume`,
        ``,
        `This is the most serious signal. Stay calm and do nothing.`,
      ].join('\n');
    }
  } else {
    // Clear thesis stop — BTC closed above MA
    const wasStop = await store.get(`thesisStop:${pid}`);
    await store.set(`thesisStop:${pid}`, false);
    await clearAlerted(key);
    if (wasStop) {
      return [
        `${tag(pName)} ✅ THESIS RESUMED: BTC back above 200-week MA`,
        ``,
        `BTC closed above the 200-week moving average (${fmtUsd(ma200)}).`,
        `The long-term trend is intact again. Normal buying can resume.`,
      ].join('\n');
    }
  }
  return null;
}

// 6. Upside break — BTC weekly close > upsideBreakMult × 200wMA (fires ONCE)
// Deploys upsideDeployPct of each coin's remaining powder
export async function checkUpsideBreak(btcWeeklyCloses, ma200, config, pid, pName, prices) {
  if (!btcWeeklyCloses || btcWeeklyCloses.length < 1 || !ma200) return null;

  const done = await store.get(`upsideBreakDone:${pid}`);
  if (done) return null;

  const ubMult = config.upsideBreakMult || 1.20;
  const ubDeployPct = config.upsideDeployPct || 0.40;
  const lastClose = btcWeeklyCloses[btcWeeklyCloses.length - 1];
  const threshold = ma200 * ubMult;
  if (lastClose > threshold) {
    await store.set(`upsideBreakDone:${pid}`, true);
    const powder = config?.powderRemaining || 0;
    const coins = Object.keys(config.coins);
    const perCoinPowder = coins.length > 0 ? powder / coins.length : 0;
    const deployAmt = perCoinPowder * ubDeployPct;
    const totalDeploy = deployAmt * coins.length;
    const deployPctLabel = (ubDeployPct * 100).toFixed(0);

    const lines = coins.map(c => {
      const p = prices?.[c];
      if (!p) return `  ${c}: price unavailable`;
      const qty = deployAmt / p;
      return `  ${c}: buy ${fmtCoin(qty)} at ${fmtUsd(p)} — spend ${fmtUsd(deployAmt)}`;
    });

    return [
      `${tag(pName)} 🚀 UPSIDE BREAKOUT: BTC above ${fmtUsd(threshold)} (${ubMult}× 200wMA)`,
      ``,
      `BTC closed the week at ${fmtUsd(lastClose)} — the downtrend is broken!`,
      `Deploy ${deployPctLabel}% of each coin's remaining powder NOW.`,
      ``,
      `What to do:`,
      ...lines,
      ``,
      `Total to deploy: ${fmtUsd(totalDeploy)}`,
      `Cash remaining after: ${fmtUsd(powder - totalDeploy)}`,
    ].join('\n');
  }
  return null;
}

// 7. Monthly check — 1st of month summary
export async function checkMonthly(config, prices, pid, pName) {
  const now = new Date();
  if (now.getUTCDate() !== 1) return null;
  const monthKey = `${pid}:monthly:${now.getUTCFullYear()}-${now.getUTCMonth()}`;
  if (await wasAlerted(monthKey)) return null;
  await markAlerted(monthKey);

  let totalInvested = 0;
  let totalValue = 0;
  let lines = [];

  for (const [coin, cc] of Object.entries(config.coins)) {
    const p = prices[coin];
    if (!p || !cc.avgCost || cc.avgCost === 0) continue;
    const coinsHeld = cc.holdingsUsd / cc.avgCost;
    const currentValue = coinsHeld * p;
    const pnl = currentValue - cc.holdingsUsd;
    const pnlPct = ((p - cc.avgCost) / cc.avgCost) * 100;
    totalInvested += cc.holdingsUsd;
    totalValue += currentValue;

    lines.push(`  ${coin}: ${fmtCoin(coinsHeld)} coins @ avg ${fmtUsd(cc.avgCost)}`);
    lines.push(`    Current price: ${fmtUsd(p)} | Value: ${fmtUsd(currentValue)} | P&L: ${pnl >= 0 ? '+' : ''}${fmtUsd(pnl)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`);
  }

  const totalPnl = totalValue - totalInvested;

  return [
    `${tag(pName)} 📊 MONTHLY REVIEW — Take 10 minutes to check your positions`,
    ``,
    ...lines,
    ``,
    `  Total invested: ${fmtUsd(totalInvested)}`,
    `  Current value: ${fmtUsd(totalValue)}`,
    `  Overall P&L: ${totalPnl >= 0 ? '+' : ''}${fmtUsd(totalPnl)}`,
    ``,
    `  Cash ready: ${fmtUsd(config.powderRemaining)} | Reserve: ${fmtUsd(config.reserveRemaining)}`,
    ``,
    `Questions to ask yourself:`,
    `  - Has anything changed about why I own these coins?`,
    `  - Am I comfortable with my position sizes?`,
    `  - Do I need to adjust my buy references?`,
  ].join('\n');
}
