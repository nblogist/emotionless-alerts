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

// 1. Buy band — price drops 7%+ below buyReference
export async function checkBuyBand(coin, price, config) {
  const ref = config.coins[coin].buyReference;
  const threshold = ref * (1 - config.buyBandPct);
  const key = `buyBand:${coin}`;
  if (price <= threshold) {
    if (!(await wasAlerted(key))) {
      await markAlerted(key);
      return `BUY: ${coin} -7% from ref $${ref.toLocaleString()}. Deploy next rung. New ref after fill.`;
    }
  } else {
    await clearAlerted(key);
  }
  return null;
}

// 2. Sell trigger — +40% over avg cost (first trim), then each +25%
export async function checkSellTrigger(coin, price, config) {
  const avgCost = config.coins[coin].avgCost;
  const pctAbove = (price - avgCost) / avgCost;
  if (pctAbove < config.firstSellPct) {
    await store.set(`sellLevel:${coin}`, 0);
    return null;
  }
  const level = 1 + Math.floor((pctAbove - config.firstSellPct) / config.sellStepPct);
  const prevLevel = (await store.get(`sellLevel:${coin}`)) || 0;
  if (level > prevLevel) {
    await store.set(`sellLevel:${coin}`, level);
    return `SELL 15%: ${coin} +${(pctAbove * 100).toFixed(0)}% over avg cost. Trim, keep core riding.`;
  }
  return null;
}

// 3. Drawdown zone — price crosses into -20%, -35%, -50% band vs cycle high
export async function checkDrawdownZone(coin, price) {
  let cycleHigh = (await store.get(`cycleHigh:${coin}`)) || 0;
  if (price > cycleHigh) {
    cycleHigh = price;
    await store.set(`cycleHigh:${coin}`, cycleHigh);
  }
  if (cycleHigh === 0) return null;
  const drawdown = (cycleHigh - price) / cycleHigh;

  let zone = null;
  let action = '';
  if (drawdown >= 0.50) { zone = '50'; action = 'STOP, watch for floor'; }
  else if (drawdown >= 0.35) { zone = '35'; action = 'STOP, watch for floor'; }
  else if (drawdown >= 0.20) { zone = '20'; action = 'keep laddering'; }

  const prevZone = await store.get(`drawdownZone:${coin}`);
  await store.set(`drawdownZone:${coin}`, zone);

  if (zone && zone !== prevZone) {
    return `${coin} now -${zone}% from high. Zone: ${action}.`;
  }
  return null;
}

// 4. Floor confirmed — 2 consecutive weekly closes > lowest, while in -35/-50 zone
export async function checkFloorConfirmed(coin, weeklyCloses) {
  if (!weeklyCloses || weeklyCloses.length < 3) return null;
  const zone = await store.get(`drawdownZone:${coin}`);
  if (zone !== '35' && zone !== '50') return null;

  const lowest = Math.min(...weeklyCloses);
  const last2 = weeklyCloses.slice(-2);
  if (last2[0] > lowest && last2[1] > lowest) {
    const key = `floorConfirmed:${coin}`;
    if (!(await wasAlerted(key))) {
      await markAlerted(key);
      return `FLOOR CONFIRMED on ${coin}. Deep-crash reserve unlocked.`;
    }
  }
  return null;
}

// 5. Thesis break — BTC 2 weekly closes below 200-week MA
export async function checkThesisBreak(btcWeeklyCloses, ma200) {
  if (!btcWeeklyCloses || btcWeeklyCloses.length < 2 || !ma200) return null;
  const last2 = btcWeeklyCloses.slice(-2);
  const key = 'thesisBreak';
  if (last2[0] < ma200 && last2[1] < ma200) {
    if (!(await wasAlerted(key))) {
      await markAlerted(key);
      return 'THESIS BREAK: cancel rungs, stop buying, hold. Re-entry on 1 close back above 200wMA.';
    }
  } else {
    await clearAlerted(key);
  }
  return null;
}

// 6. Upside break — BTC weekly close > $90,000 (configurable)
export async function checkUpsideBreak(btcWeeklyCloses, upsideBreakUsd) {
  if (!btcWeeklyCloses || btcWeeklyCloses.length < 1) return null;
  const lastClose = btcWeeklyCloses[btcWeeklyCloses.length - 1];
  const key = 'upsideBreak';
  if (lastClose > upsideBreakUsd) {
    if (!(await wasAlerted(key))) {
      await markAlerted(key);
      return 'UPSIDE BREAK: downtrend broken. Deploy 40% of remaining powder at market today.';
    }
  } else {
    await clearAlerted(key);
  }
  return null;
}

// 7. Monthly check — 1st of month summary
export async function checkMonthly(config, prices) {
  const now = new Date();
  if (now.getUTCDate() !== 1) return null;
  const monthKey = `monthly:${now.getUTCFullYear()}-${now.getUTCMonth()}`;
  if (await wasAlerted(monthKey)) return null;
  await markAlerted(monthKey);

  let summary = '1st of month. 10-min review. Current state:\n';
  for (const [coin, cc] of Object.entries(config.coins)) {
    const p = prices[coin];
    if (!p) continue;
    const vsRef = ((p - cc.buyReference) / cc.buyReference) * 100;
    const vsAvg = ((p - cc.avgCost) / cc.avgCost) * 100;
    summary += `\n${coin}: $${p.toLocaleString()} | vs ref: ${vsRef >= 0 ? '+' : ''}${vsRef.toFixed(1)}% | vs avg: ${vsAvg >= 0 ? '+' : ''}${vsAvg.toFixed(1)}%`;
  }
  summary += `\n\nPowder: $${config.powderRemaining} | Reserve: $${config.reserveRemaining}`;
  return summary;
}
