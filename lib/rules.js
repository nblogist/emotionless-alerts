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

function rungSize(config) {
  const powder = config.powderRemaining || 0;
  return Math.max(powder / 5, 0);
}

function tag(portfolioName) {
  return `[${portfolioName}]`;
}

// 1. Buy band — price drops 7%+ below buyReference
export async function checkBuyBand(coin, price, config, pid, pName) {
  const cc = config.coins[coin];
  const ref = cc.buyReference;
  const threshold = ref * (1 - config.buyBandPct);
  const key = `${pid}:buyBand:${coin}`;
  if (price <= threshold) {
    if (!(await wasAlerted(key))) {
      await markAlerted(key);
      const deploy = rungSize(config);
      const coinsToBuy = deploy / price;
      const actualDrop = ((ref - price) / ref * 100).toFixed(1);
      const newAvg = cc.holdingsUsd > 0
        ? ((cc.holdingsUsd + deploy) / ((cc.holdingsUsd / cc.avgCost) + coinsToBuy))
        : price;
      return [
        `${tag(pName)} 🟢 BUY ${coin} NOW`,
        ``,
        `Price: ${fmtUsd(price)} (down ${actualDrop}% from your last buy at ${fmtUsd(ref)} — crossed the ${(config.buyBandPct * 100).toFixed(0)}% buy-band trigger)`,
        ``,
        `What to do:`,
        `  1. Buy ${fmtCoin(coinsToBuy)} ${coin} at ${fmtUsd(price)}`,
        `  2. Spend: ${fmtUsd(deploy)} (1 rung = 1/5 of your remaining cash)`,
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

// 2. Sell trigger — +40% over avg cost (first trim), then each +25%
export async function checkSellTrigger(coin, price, config, pid, pName) {
  const cc = config.coins[coin];
  const avgCost = cc.avgCost;
  if (!avgCost || avgCost === 0) return null;
  const pctAbove = (price - avgCost) / avgCost;
  if (pctAbove < config.firstSellPct) {
    await store.set(`sellLevel:${pid}:${coin}`, 0);
    return null;
  }
  const level = 1 + Math.floor((pctAbove - config.firstSellPct) / config.sellStepPct);
  const prevLevel = (await store.get(`sellLevel:${pid}:${coin}`)) || 0;
  if (level > prevLevel) {
    await store.set(`sellLevel:${pid}:${coin}`, level);
    const totalCoins = cc.holdingsUsd / avgCost;
    const coinsToSell = totalCoins * 0.15;
    const sellValue = coinsToSell * price;
    const profit = sellValue - (coinsToSell * avgCost);
    return [
      `${tag(pName)} 🔴 SELL 15% of ${coin} NOW`,
      ``,
      `Price: ${fmtUsd(price)} (+${(pctAbove * 100).toFixed(0)}% above your avg cost of ${fmtUsd(avgCost)})`,
      ``,
      `What to do:`,
      `  1. Sell ${fmtCoin(coinsToSell)} ${coin} at ${fmtUsd(price)}`,
      `  2. You'll receive: ${fmtUsd(sellValue)}`,
      `  3. Profit on this sell: ~${fmtUsd(profit)}`,
      `  4. Keep the remaining 85% riding the trend`,
      `  5. Go to the Transactions page and log this sell`,
      ``,
      `Next sell triggers if ${coin} reaches ${fmtUsd(avgCost * (1 + config.firstSellPct + (level * config.sellStepPct)))}`,
    ].join('\n');
  }
  return null;
}

// 3. Drawdown zone — price crosses into -20%, -35%, -50% band vs cycle high
export async function checkDrawdownZone(coin, price, pid, pName) {
  let cycleHigh = (await store.get(`cycleHigh:${coin}`)) || 0;
  if (price > cycleHigh) {
    cycleHigh = price;
    await store.set(`cycleHigh:${coin}`, cycleHigh);
  }
  if (cycleHigh === 0) return null;
  const drawdown = (cycleHigh - price) / cycleHigh;

  let zone = null;
  let action = '';
  if (drawdown >= 0.50) {
    zone = '50';
    action = [
      `${tag(pName)} ⚠️ ${coin} CRASH: -50% from high`,
      ``,
      `${coin} dropped from ${fmtUsd(cycleHigh)} to ${fmtUsd(price)} — a 50%+ crash.`,
      ``,
      `What to do:`,
      `  1. STOP buying — do NOT deploy more cash`,
      `  2. HOLD what you have — do NOT panic sell`,
      `  3. Wait for FLOOR CONFIRMATION (2 weekly closes above the bottom)`,
      `  4. Your emergency reserve will unlock when floor confirms`,
    ].join('\n');
  } else if (drawdown >= 0.35) {
    zone = '35';
    action = [
      `${tag(pName)} ⚠️ ${coin} DEEP DIP: -35% from high`,
      ``,
      `${coin} dropped from ${fmtUsd(cycleHigh)} to ${fmtUsd(price)} — a 35%+ drawdown.`,
      ``,
      `What to do:`,
      `  1. STOP buying — save your cash for lower`,
      `  2. HOLD what you have`,
      `  3. Wait for floor confirmation before buying more`,
    ].join('\n');
  } else if (drawdown >= 0.20) {
    zone = '20';
    action = [
      `${tag(pName)} ⚡ ${coin} DIP: -20% from high`,
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
export async function checkThesisBreak(btcWeeklyCloses, ma200, pid, pName) {
  if (!btcWeeklyCloses || btcWeeklyCloses.length < 2 || !ma200) return null;
  const last2 = btcWeeklyCloses.slice(-2);
  const key = `${pid}:thesisBreak`;
  if (last2[0] < ma200 && last2[1] < ma200) {
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
    await clearAlerted(key);
  }
  return null;
}

// 6. Upside break — BTC weekly close > threshold
export async function checkUpsideBreak(btcWeeklyCloses, upsideBreakUsd, config, pid, pName) {
  if (!btcWeeklyCloses || btcWeeklyCloses.length < 1) return null;
  const lastClose = btcWeeklyCloses[btcWeeklyCloses.length - 1];
  const key = `${pid}:upsideBreak`;
  if (lastClose > upsideBreakUsd) {
    if (!(await wasAlerted(key))) {
      await markAlerted(key);
      const powder = config?.powderRemaining || 0;
      const deploy = powder * 0.40;
      const coinsToBuy = deploy / lastClose;
      return [
        `${tag(pName)} 🚀 UPSIDE BREAKOUT: BTC above ${fmtUsd(upsideBreakUsd)}`,
        ``,
        `BTC closed the week at ${fmtUsd(lastClose)} — the downtrend is broken!`,
        `Momentum is back. The strategy says deploy 40% of remaining cash NOW.`,
        ``,
        `What to do:`,
        `  1. Buy ${fmtCoin(coinsToBuy)} BTC at market price (~${fmtUsd(lastClose)})`,
        `  2. Spend: ${fmtUsd(deploy)} (40% of your ${fmtUsd(powder)} remaining cash)`,
        `  3. Don't wait for a dip — buy at market today`,
        `  4. Log the transaction in the Transactions page`,
        ``,
        `Cash remaining after this: ${fmtUsd(powder - deploy)}`,
      ].join('\n');
    }
  } else {
    await clearAlerted(key);
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
