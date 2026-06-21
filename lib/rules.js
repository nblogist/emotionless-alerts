import * as store from './store.js';
import { STRATEGY_CONFIG } from './defaults.js';

// ── Alert dedup helpers ──
async function wasAlerted(key) {
  return !!(await store.get(`alerted:${key}`));
}
async function markAlerted(key) {
  await store.set(`alerted:${key}`, true);
}
async function clearAlerted(key) {
  await store.set(`alerted:${key}`, false);
}

// ── Formatting ──
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

function fmtPct(n) {
  return (n * 100).toFixed(1) + '%';
}

function tag(portfolioName) {
  return `[${portfolioName}]`;
}

// ── Portfolio math ──

// Returns the target $ value for an asset: weight × capital
export function getTargetValue(asset, portfolio) {
  const weight = asset.weight || (1 / portfolio.assetCount);
  return weight * portfolio.capital;
}

// Returns how far the asset's current value deviates from target (-0.12 = 12% below)
export function getDeviation(currentValue, targetValue) {
  if (targetValue === 0) return 0;
  return (currentValue - targetValue) / targetValue;
}

// Spendable cash = cash above the 10% floor of portfolio value
export function getSpendableCash(portfolio) {
  const floor = portfolio.portfolioValue * 0.10;
  return Math.max(0, portfolio.cash - floor);
}

// ══════════════════════════════════════════════════════════════
// 1. BUY THE DIP — opportunity-based, two paths:
//    (a) price < avgCost  — cost-lowering dip
//    (b) price ≥ dipFromHighPct below recent high — winner dip
// Guards: don't buy if >10% over target, never breach cash floor.
// Size = clip toward target (half the gap), capped at spendable cash.
// ══════════════════════════════════════════════════════════════
export async function checkBuyDip(asset, price, portfolio, pid, pName, recentHigh) {
  if (!price || price === 0) return null;
  if (!asset.avgCost || asset.avgCost === 0) return null;

  const { dipFromHighPct, minDipPct } = STRATEGY_CONFIG.liquidBasket;

  // Path (a): price meaningfully below avg cost (must exceed minDipPct threshold)
  const discount = (asset.avgCost - price) / asset.avgCost;
  const belowCost = discount >= minDipPct;

  // Path (b): price ≥ dipFromHighPct below recent high (a winner pulling back)
  const dipFromHigh = recentHigh > 0 && price <= recentHigh * (1 - dipFromHighPct);

  // Must satisfy at least one trigger path
  if (!belowCost && !dipFromHigh) return null;

  // Guardrail: don't buy if already at or above target weight (+10% tolerance)
  const targetVal = getTargetValue(asset, portfolio);
  const currentVal = asset.currentValue || 0;
  const dev = getDeviation(currentVal, targetVal);
  if (dev > 0.10) return null;

  const key = `${pid}:buyDip:${asset.symbol}`;
  if (await wasAlerted(key)) return null;

  // Determine which path fired (prefer below-cost if both)
  const buyReason = belowCost ? 'below_cost' : 'dip_from_high';
  const highDrop = recentHigh > 0 ? (recentHigh - price) / recentHigh : 0;

  // Size: clip toward target (not a full lump), capped at spendable cash
  const gapToTarget = Math.max(targetVal - currentVal, 0);
  const clip = gapToTarget > 0 ? gapToTarget * 0.5 : 0;
  const spendable = getSpendableCash(portfolio);
  const buyAmount = Math.min(clip, spendable);

  const discountPct = ((asset.avgCost - price) / asset.avgCost * 100).toFixed(1);
  const dropPct = (highDrop * 100).toFixed(1);

  const headline = buyReason === 'below_cost'
    ? `${tag(pName)} BUY ${asset.symbol} — ${discountPct}% below your avg cost`
    : `${tag(pName)} BUY ${asset.symbol} — ${dropPct}% off its recent high`;

  if (buyAmount <= 0) {
    await markAlerted(key);
    const floor = portfolio.portfolioValue * 0.10;
    return {
      type: 'BUY_DIP',
      asset: asset.symbol,
      buyReason,
      buyAmountUsd: 0,
      idealGapUsd: gapToTarget,
      discount: belowCost ? (asset.avgCost - price) / asset.avgCost : 0,
      highDrop,
      recentHigh: recentHigh || null,
      deviation: dev,
      price,
      avgCost: asset.avgCost,
      targetValue: targetVal,
      currentValue: currentVal,
      capped: true,
      cappedReason: portfolio.cash <= floor ? 'cash at 10% floor' : 'no cash',
      message: [
        headline,
        ``,
        buyReason === 'below_cost'
          ? `Price: ${fmtUsd(price)} vs your avg cost ${fmtUsd(asset.avgCost)} (${discountPct}% discount).`
          : `Price: ${fmtUsd(price)} — down ${dropPct}% from its ${STRATEGY_CONFIG.liquidBasket.recentHighWindowDays}-day high of ${fmtUsd(recentHigh)}.`,
        buyReason === 'below_cost' ? `This buy would lower your average cost.` : `A real dip on a winner — good entry.`,
        `Cash: ${fmtUsd(portfolio.cash)} — at the 10% dry-powder floor (${fmtUsd(floor)}). No spendable cash right now.`,
      ].join('\n'),
    };
  }

  await markAlerted(key);

  const coinsToBuy = buyAmount / price;
  const capped = buyAmount < clip;
  const floor = portfolio.portfolioValue * 0.10;

  return {
    type: 'BUY_DIP',
    asset: asset.symbol,
    buyReason,
    buyAmountUsd: buyAmount,
    idealGapUsd: gapToTarget,
    discount: belowCost ? (asset.avgCost - price) / asset.avgCost : 0,
    highDrop,
    recentHigh: recentHigh || null,
    deviation: dev,
    price,
    avgCost: asset.avgCost,
    targetValue: targetVal,
    currentValue: currentVal,
    coinsToBuy,
    capped,
    cappedReason: capped ? `capped at spendable cash (${fmtUsd(spendable)}); 10% floor = ${fmtUsd(floor)}` : null,
    message: [
      headline,
      ``,
      buyReason === 'below_cost'
        ? `Price: ${fmtUsd(price)} (${discountPct}% below your avg cost of ${fmtUsd(asset.avgCost)})`
        : `Price: ${fmtUsd(price)} — down ${dropPct}% from its ${STRATEGY_CONFIG.liquidBasket.recentHighWindowDays}-day high of ${fmtUsd(recentHigh)}`,
      `Current value: ${fmtUsd(currentVal)} vs target ${fmtUsd(targetVal)}.`,
      ``,
      `What to do:`,
      `  1. Buy ${fmtCoin(coinsToBuy)} ${asset.symbol} at ${fmtUsd(price)}`,
      `  2. Spend: ${fmtUsd(buyAmount)}${capped ? ` (capped — ${fmtUsd(spendable)} spendable above 10% floor)` : ` (half the gap to target)`}`,
      `  3. Cash after: ${fmtUsd(portfolio.cash - buyAmount)}`,
      buyReason === 'below_cost'
        ? `  4. This lowers your avg cost — a genuine dip buy`
        : `  4. A real dip on a winner — good entry point`,
    ].join('\n'),
  };
}

// Clear buy-dip alert when price recovers (above cost AND within 10% of recent high)
export async function clearBuyDipIfRecovered(asset, price, portfolio, pid, recentHigh) {
  if (!asset.avgCost || asset.avgCost === 0) return;
  const { dipFromHighPct } = STRATEGY_CONFIG.liquidBasket;
  const aboveCost = price >= asset.avgCost;
  const nearHigh = !recentHigh || recentHigh <= 0 || price > recentHigh * (1 - dipFromHighPct);
  if (aboveCost && nearHigh) {
    await clearAlerted(`${pid}:buyDip:${asset.symbol}`);
  }
}

// ══════════════════════════════════════════════════════════════
// 2. SKIM ON A POP — up ≥20% from last action AND above cost
// Sells 5% of position, resets reference
// ══════════════════════════════════════════════════════════════
export async function checkSkim(asset, price, pid, pName) {
  if (!price || price === 0) return null;
  if (!asset.avgCost || asset.avgCost === 0) return null;

  // Must be above average cost
  if (price <= asset.avgCost) return null;

  // Reference = price at last action (buy or sell)
  const lastActionPrice = asset.lastActionPrice || asset.avgCost;

  // Must be up ≥20% from last action
  const gainFromAction = (price - lastActionPrice) / lastActionPrice;
  if (gainFromAction < 0.20) return null;

  const key = `${pid}:skim:${asset.symbol}:${lastActionPrice}`;
  if (await wasAlerted(key)) return null;

  await markAlerted(key);

  const totalCoins = asset.holdingsUsd / asset.avgCost;
  const skimCoins = totalCoins * 0.05;
  const skimValue = skimCoins * price;
  const gainPct = ((price - asset.avgCost) / asset.avgCost * 100).toFixed(1);

  return {
    type: 'SKIM',
    asset: asset.symbol,
    skimCoins,
    skimValueUsd: skimValue,
    gainFromAction: gainFromAction,
    price,
    lastActionPrice,
    message: [
      `${tag(pName)} SKIM 5% of ${asset.symbol} — up ${fmtPct(gainFromAction)} since last action`,
      ``,
      `Price: ${fmtUsd(price)} (+${gainPct}% above avg cost ${fmtUsd(asset.avgCost)})`,
      `Last action was at ${fmtUsd(lastActionPrice)} — now up ${fmtPct(gainFromAction)} from there.`,
      ``,
      `What to do:`,
      `  1. Sell ${fmtCoin(skimCoins)} ${asset.symbol} at ${fmtUsd(price)}`,
      `  2. You'll receive: ${fmtUsd(skimValue)}`,
      `  3. The other 95% keeps riding`,
      `  4. Log the sell — reference resets to ${fmtUsd(price)}`,
    ].join('\n'),
  };
}

// ══════════════════════════════════════════════════════════════
// 3. BIG TRIM — monthly, when asset ≥20% above target
// Trims back toward target
// ══════════════════════════════════════════════════════════════
export async function checkBigTrim(asset, price, portfolio, pid, pName) {
  if (!price || price === 0) return null;
  if (!asset.holdingsUsd || asset.holdingsUsd === 0) return null;

  const targetVal = getTargetValue(asset, portfolio);
  const currentVal = asset.currentValue || 0;
  const dev = getDeviation(currentVal, targetVal);

  // Only fire when ≥20% above target
  if (dev < 0.20) return null;

  const monthKey = `${pid}:bigTrim:${asset.symbol}:${new Date().getUTCFullYear()}-${new Date().getUTCMonth()}`;
  if (await wasAlerted(monthKey)) return null;
  await markAlerted(monthKey);

  const excess = currentVal - targetVal;
  const totalCoins = asset.holdingsUsd / asset.avgCost;
  const trimCoins = excess / price;
  const trimPct = (excess / currentVal * 100).toFixed(1);

  return {
    type: 'BIG_TRIM',
    asset: asset.symbol,
    trimCoins,
    trimValueUsd: excess,
    deviation: dev,
    price,
    targetValue: targetVal,
    currentValue: currentVal,
    message: [
      `${tag(pName)} TRIM ${asset.symbol} — ${fmtPct(dev)} above target (monthly check)`,
      ``,
      `Price: ${fmtUsd(price)}`,
      `Current value: ${fmtUsd(currentVal)} vs target ${fmtUsd(targetVal)} (${fmtPct(dev)} above).`,
      ``,
      `What to do:`,
      `  1. Sell ${fmtCoin(trimCoins)} ${asset.symbol} at ${fmtUsd(price)}`,
      `  2. You'll receive: ${fmtUsd(excess)} (${trimPct}% of position)`,
      `  3. This brings ${asset.symbol} back toward its target weight`,
      `  4. Log the sell in Transactions`,
    ].join('\n'),
  };
}

// ══════════════════════════════════════════════════════════════
// 4. CRASH BRAKE — optional (default OFF)
// BTC 2 weekly closes < 200wMA → shift half crypto target to gold+cash
// 1 close above → re-risk
// ══════════════════════════════════════════════════════════════

/**
 * Apply crash-brake weight shifts to assets (§A.5).
 * Each crypto (non-XAUT) target halves; freed weight splits 50/50
 * between gold and cash (cash stays unallocated).
 * Returns new array — does NOT mutate originals.
 */
export function applyCrashBrakeWeights(assets) {
  const cryptoAssets = assets.filter(a => a.class === 'liquid' && a.symbol !== 'XAUT');
  const totalFreed = cryptoAssets.reduce((s, a) => s + (a.weight || 0) * 0.5, 0);
  const goldBoost = totalFreed / 2;

  return assets.map(a => {
    if (a.class === 'liquid' && a.symbol !== 'XAUT') {
      return { ...a, weight: (a.weight || 0) * 0.5 };
    }
    if (a.symbol === 'XAUT') {
      return { ...a, weight: (a.weight || 0) + goldBoost };
    }
    return { ...a };
  });
}

export async function checkCrashBrake(btcWeeklyCloses, ma200, pid, pName, enabled) {
  if (!enabled) return null;
  if (!btcWeeklyCloses || btcWeeklyCloses.length < 2 || !ma200) return null;

  const last2 = btcWeeklyCloses.slice(-2);
  const key = `${pid}:crashBrake`;

  if (last2[0] < ma200 && last2[1] < ma200) {
    await store.set(`crashBrakeActive:${pid}`, true);
    if (!(await wasAlerted(key))) {
      await markAlerted(key);
      return {
        type: 'CRASH_BRAKE',
        action: 'deRisk',
        message: [
          `${tag(pName)} CRASH BRAKE: BTC below 200-week MA for 2 weeks`,
          ``,
          `BTC closed below the 200-week moving average (${fmtUsd(ma200)}) for 2 weeks straight.`,
          ``,
          `What to do:`,
          `  1. Shift half of each crypto target into gold + cash (50/50)`,
          `  2. Do NOT sell existing positions — just redirect future buys`,
          `  3. Wait for BTC to close 1 week above ${fmtUsd(ma200)} to re-risk`,
        ].join('\n'),
      };
    }
  } else {
    const wasActive = await store.get(`crashBrakeActive:${pid}`);
    await store.set(`crashBrakeActive:${pid}`, false);
    await clearAlerted(key);
    if (wasActive) {
      return {
        type: 'CRASH_BRAKE',
        action: 'reRisk',
        message: [
          `${tag(pName)} CRASH BRAKE LIFTED: BTC back above 200-week MA`,
          ``,
          `BTC closed above the 200-week moving average (${fmtUsd(ma200)}).`,
          `Crypto targets restored to normal weights. Resume normal operations.`,
        ].join('\n'),
      };
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
// 5. MONTHLY SUMMARY — 1st of month
// ══════════════════════════════════════════════════════════════
export async function checkMonthly(portfolio, prices, pid, pName) {
  const now = new Date();
  if (now.getUTCDate() !== 1) return null;
  const monthKey = `${pid}:monthly:${now.getUTCFullYear()}-${now.getUTCMonth()}`;
  if (await wasAlerted(monthKey)) return null;
  await markAlerted(monthKey);

  let lines = [];
  const assets = portfolio.assets || [];

  for (const asset of assets) {
    const p = prices[asset.symbol];
    if (!p || !asset.avgCost || asset.avgCost === 0) continue;
    const totalCoins = asset.holdingsUsd / asset.avgCost;
    const currentVal = totalCoins * p;
    const pnl = currentVal - asset.holdingsUsd;
    const pnlPct = ((p - asset.avgCost) / asset.avgCost) * 100;
    const targetVal = getTargetValue(asset, portfolio);
    const dev = getDeviation(currentVal, targetVal);

    lines.push(`  ${asset.symbol}: ${fmtCoin(totalCoins)} coins @ avg ${fmtUsd(asset.avgCost)}`);
    lines.push(`    Value: ${fmtUsd(currentVal)} | Target: ${fmtUsd(targetVal)} | Dev: ${dev >= 0 ? '+' : ''}${fmtPct(dev)} | P&L: ${pnl >= 0 ? '+' : ''}${fmtUsd(pnl)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`);
  }

  const totalValue = assets.reduce((s, a) => {
    const p = prices[a.symbol];
    if (!p || !a.avgCost || a.avgCost === 0) return s;
    return s + (a.holdingsUsd / a.avgCost) * p;
  }, 0);
  const totalCost = assets.reduce((s, a) => s + (a.holdingsUsd || 0), 0);
  const totalPnl = totalValue - totalCost;

  return {
    type: 'MONTHLY',
    message: [
      `${tag(pName)} MONTHLY REVIEW`,
      ``,
      ...lines,
      ``,
      `  Portfolio value: ${fmtUsd(totalValue)}`,
      `  Total cost: ${fmtUsd(totalCost)}`,
      `  Overall P&L: ${totalPnl >= 0 ? '+' : ''}${fmtUsd(totalPnl)}`,
      `  Cash: ${fmtUsd(portfolio.cash)}`,
      `  Capital: ${fmtUsd(portfolio.capital)}`,
    ].join('\n'),
  };
}
