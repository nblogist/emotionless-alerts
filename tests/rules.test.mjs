import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../lib/rules.js';
import * as mockStore from './mock-store.js';

// ── Helpers ──

function makePortfolio(overrides = {}) {
  const base = {
    capital: 10000,
    cash: 3000,
    portfolioValue: 10000,
    assetCount: 4,
    assets: [
      { symbol: 'BTC',  class: 'liquid', weight: 0.25, holdingsUsd: 1750, avgCost: 70000, lastActionPrice: 70000, currentValue: 1750 },
      { symbol: 'ETH',  class: 'liquid', weight: 0.25, holdingsUsd: 1750, avgCost: 2600, lastActionPrice: 2600, currentValue: 1750 },
      { symbol: 'SOL',  class: 'liquid', weight: 0.25, holdingsUsd: 1750, avgCost: 72, lastActionPrice: 72, currentValue: 1750 },
      { symbol: 'XAUT', class: 'liquid', weight: 0.25, holdingsUsd: 1750, avgCost: 2700, lastActionPrice: 2700, currentValue: 1750 },
    ],
  };
  return { ...base, ...overrides };
}

function makeAsset(overrides = {}) {
  return {
    symbol: 'BTC',
    class: 'liquid',
    weight: 0.25,
    holdingsUsd: 1750,
    avgCost: 70000,
    lastActionPrice: 70000,
    currentValue: 1750,
    ...overrides,
  };
}

const PID = 'test';
const PNAME = 'Test';

// ══════════════════════════════════════════════════════════════
// §F Verification Checklist
// ══════════════════════════════════════════════════════════════

describe('§F Checklist — Liquid Basket', () => {
  beforeEach(() => mockStore._clear());

  // §F.1: BUY fires when price < avgCost; size = half the gap to target; shown in $
  test('BUY fires when price is below avg cost', async () => {
    // avgCost = 70000, price = 65000 → below cost. Target = 2500, current = 2200, gap = 300, clip = 150.
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ currentValue: 2200 });
    const result = await rules.checkBuyDip(asset, 65000, portfolio, PID, PNAME);
    assert.ok(result, 'Should fire');
    assert.equal(result.type, 'BUY_DIP');
    // Gap = 2500 - 2200 = 300. Clip = 150 (half).
    assert.equal(result.buyAmountUsd, 150, 'Buy amount = half the gap to target');
    assert.ok(result.message.includes('$'), 'Shows dollar amount');
  });

  // §F.2: No buy fires when price is at or above avg cost
  test('No buy when price is at or above avg cost', async () => {
    // avgCost = 70000, price = 72000 → above cost, no buy regardless of weight.
    const portfolio = makePortfolio();
    const asset = makeAsset({ currentValue: 2300 });
    const result = await rules.checkBuyDip(asset, 72000, portfolio, PID, PNAME);
    assert.equal(result, null, 'Should not fire above avg cost');
  });

  // No buy when asset is already >10% over target (over-concentrated)
  test('No buy when asset is already over target (+10% tolerance)', async () => {
    // avgCost = 70000, price = 65000 → below cost. But currentValue = 3000 vs target = 2500 → 20% above → blocked.
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ currentValue: 3000 });
    const result = await rules.checkBuyDip(asset, 65000, portfolio, PID, PNAME);
    assert.equal(result, null, 'Should not fire — already over-concentrated');
  });

  // §F.3: SKIM fires at +20% from last action & above cost; sells 5%; resets reference
  test('SKIM fires at +20% from last action & above cost; sells 5%', async () => {
    // avgCost = 100, lastActionPrice = 100, price = 121 → +21% from last action, above cost
    const asset = makeAsset({
      symbol: 'SOL', avgCost: 100, lastActionPrice: 100,
      holdingsUsd: 1000, currentValue: 1210,
    });
    const result = await rules.checkSkim(asset, 121, PID, PNAME);
    assert.ok(result, 'Should fire');
    assert.equal(result.type, 'SKIM');
    // totalCoins = 1000/100 = 10. 5% = 0.5 coins.
    assert.ok(Math.abs(result.skimCoins - 0.5) < 0.001, 'Sells 5% of position');
    assert.ok(result.message.includes('$'), 'Shows dollar amount');
  });

  // §F.4: SKIM does NOT fire below cost or below +20%
  test('SKIM does NOT fire below cost', async () => {
    const asset = makeAsset({ avgCost: 100, lastActionPrice: 100 });
    const result = await rules.checkSkim(asset, 90, PID, PNAME);
    assert.equal(result, null, 'Should not fire below cost');
  });

  test('SKIM does NOT fire below +20%', async () => {
    const asset = makeAsset({ avgCost: 100, lastActionPrice: 100 });
    const result = await rules.checkSkim(asset, 115, PID, PNAME);
    assert.equal(result, null, 'Should not fire at +15%');
  });

  // §F.5: BIG TRIM fires only on monthly check and only when >20% above target
  test('BIG TRIM fires when >20% above target', async () => {
    // Target = 2500. Current = 3100 → 24% above.
    const portfolio = makePortfolio();
    const asset = makeAsset({ currentValue: 3100, holdingsUsd: 2000, avgCost: 60000 });
    const result = await rules.checkBigTrim(asset, 75000, portfolio, PID, PNAME);
    assert.ok(result, 'Should fire');
    assert.equal(result.type, 'BIG_TRIM');
    // Excess = 3100 - 2500 = 600
    assert.ok(Math.abs(result.trimValueUsd - 600) < 0.01, 'Trims excess back to target');
  });

  test('BIG TRIM does NOT fire when <20% above target', async () => {
    // Target = 2500. Current = 2900 → 16% above.
    const portfolio = makePortfolio();
    const asset = makeAsset({ currentValue: 2900, holdingsUsd: 2000, avgCost: 60000 });
    const result = await rules.checkBigTrim(asset, 75000, portfolio, PID, PNAME);
    assert.equal(result, null, 'Should not fire below 20%');
  });

  // §F.6: Gold is a full basket member — buys/sells like any other asset
  test('XAUT (gold) buys and sells like any other liquid asset', async () => {
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const goldAsset = makeAsset({
      symbol: 'XAUT', weight: 0.25, currentValue: 2000,
      holdingsUsd: 2000, avgCost: 2700, lastActionPrice: 2700,
    });
    // avgCost = 2700, price = 2600 → below cost. Target = 2500, current = 2000. Gap = 500, clip = 250.
    const buyResult = await rules.checkBuyDip(goldAsset, 2600, portfolio, PID, PNAME);
    assert.ok(buyResult, 'Gold buy should fire');
    assert.equal(buyResult.buyAmountUsd, 250, 'Gold buys half the gap, same as crypto');

    // Gold skim — up 20% from last action
    mockStore._clear();
    const goldSkim = makeAsset({
      symbol: 'XAUT', avgCost: 2000, lastActionPrice: 2000,
      holdingsUsd: 5000, currentValue: 6000,
    });
    const skimResult = await rules.checkSkim(goldSkim, 2400, PID, PNAME);
    assert.ok(skimResult, 'Gold skim should fire');
    assert.equal(skimResult.type, 'SKIM');
  });

  // §F.7: Sizes scale with capital; nothing hardcoded; change capital → all $ recompute
  test('Sizes scale with capital — doubling capital doubles buy amount', async () => {
    // P = 10000: target = 2500, current = 2000, gap = 500, clip = 250
    const pSmall = makePortfolio({ capital: 10000, cash: 3000, portfolioValue: 10000 });
    const aSmall = makeAsset({ currentValue: 2000 });
    const rSmall = await rules.checkBuyDip(aSmall, 65000, pSmall, 'p1', PNAME);
    assert.ok(rSmall);
    assert.equal(rSmall.buyAmountUsd, 250);

    // P = 20000: target = 5000, current = 4000, gap = 1000, clip = 500
    mockStore._clear();
    const pLarge = makePortfolio({ capital: 20000, cash: 6000, portfolioValue: 20000 });
    const aLarge = makeAsset({ currentValue: 4000 });
    const rLarge = await rules.checkBuyDip(aLarge, 65000, pLarge, 'p2', PNAME);
    assert.ok(rLarge);
    assert.equal(rLarge.buyAmountUsd, 500);
    assert.equal(rLarge.buyAmountUsd, rSmall.buyAmountUsd * 2, 'Double capital → double buy');
  });
});

// ══════════════════════════════════════════════════════════════
// Path (b): Dip-from-high trigger
// ══════════════════════════════════════════════════════════════

describe('BUY path (b) — dip from recent high', () => {
  beforeEach(() => mockStore._clear());

  test('Fires when price is ≥20% below recent high (even above avg cost)', async () => {
    // avgCost = 70000, price = 72000 (above cost!) but recentHigh = 100000 → 72000 is 28% below → fires
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ avgCost: 70000, currentValue: 2200 });
    const result = await rules.checkBuyDip(asset, 72000, portfolio, PID, PNAME, 100000);
    assert.ok(result, 'Should fire — 28% below recent high');
    assert.equal(result.buyReason, 'dip_from_high');
    assert.ok(result.highDrop > 0.20, 'highDrop should exceed 20%');
    assert.equal(result.recentHigh, 100000);
  });

  test('Does NOT fire when price is only 15% below recent high', async () => {
    // recentHigh = 100000, price = 85000 → only 15% below → no trigger
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ avgCost: 70000, currentValue: 2200 });
    const result = await rules.checkBuyDip(asset, 85000, portfolio, PID, PNAME, 100000);
    // price 85000 > avgCost 70000 → path (a) off. 15% drop < 20% → path (b) off.
    assert.equal(result, null, 'Should not fire — only 15% below high');
  });

  test('Prefers path (a) when both triggers fire', async () => {
    // price = 60000 < avgCost = 70000 → path (a). Also 40% below recentHigh = 100000 → path (b).
    // Should prefer 'below_cost'.
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ avgCost: 70000, currentValue: 2000 });
    const result = await rules.checkBuyDip(asset, 60000, portfolio, PID, PNAME, 100000);
    assert.ok(result);
    assert.equal(result.buyReason, 'below_cost', 'Prefers below_cost when both fire');
  });

  test('Path (b) respects the +10% over-target guard', async () => {
    // price = 72000, recentHigh = 100000 (28% below). But currentValue = 3000 vs target 2500 → 20% over → blocked.
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ avgCost: 70000, currentValue: 3000 });
    const result = await rules.checkBuyDip(asset, 72000, portfolio, PID, PNAME, 100000);
    assert.equal(result, null, 'Blocked — already over target');
  });

  test('Path (b) uses half-gap sizing same as path (a)', async () => {
    // recentHigh = 100000, price = 75000 (25% below). avgCost = 70000 (above cost).
    // Target = 2500, current = 2000. Gap = 500, clip = 250.
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ avgCost: 70000, currentValue: 2000 });
    const result = await rules.checkBuyDip(asset, 75000, portfolio, PID, PNAME, 100000);
    assert.ok(result);
    assert.equal(result.buyAmountUsd, 250, 'Half-gap sizing applies');
    assert.equal(result.buyReason, 'dip_from_high');
  });

  test('clearBuyDipIfRecovered clears when price above cost AND near high', async () => {
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ avgCost: 70000, currentValue: 2000 });
    // Trigger path (b)
    await rules.checkBuyDip(asset, 75000, portfolio, PID, PNAME, 100000);
    // Recover: price = 85000 (above cost, and 85000 > 100000*0.80 → near high)
    await rules.clearBuyDipIfRecovered(asset, 85000, portfolio, PID, 100000);
    // Should fire again
    const r2 = await rules.checkBuyDip(asset, 75000, portfolio, PID, PNAME, 100000);
    assert.ok(r2, 'Should re-arm after recovery');
  });

  test('clearBuyDipIfRecovered does NOT clear when still far from high', async () => {
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ avgCost: 70000, currentValue: 2000 });
    // Trigger path (b)
    await rules.checkBuyDip(asset, 75000, portfolio, PID, PNAME, 100000);
    // "Recover" above cost but still 25% below high → still in dip territory
    await rules.clearBuyDipIfRecovered(asset, 75000, portfolio, PID, 100000);
    // Should NOT re-fire (still alerted)
    const r2 = await rules.checkBuyDip(asset, 75000, portfolio, PID, PNAME, 100000);
    assert.equal(r2, null, 'Should not re-arm — still far below high');
  });

  test('No path (b) when recentHigh is 0 or missing', async () => {
    // price = 72000 > avgCost = 70000 → path (a) off. No recent high → path (b) off.
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ avgCost: 70000, currentValue: 2200 });
    const r1 = await rules.checkBuyDip(asset, 72000, portfolio, PID, PNAME, 0);
    assert.equal(r1, null);
    const r2 = await rules.checkBuyDip(asset, 72000, portfolio, PID, PNAME);
    assert.equal(r2, null);
  });
});

// ══════════════════════════════════════════════════════════════
// 10% Cash Floor tests
// ══════════════════════════════════════════════════════════════

describe('10% Cash Floor', () => {
  beforeEach(() => mockStore._clear());

  test('Buy is capped when it would breach the 10% cash floor', async () => {
    // Portfolio value = 10000, floor = 1000. Cash = 1200. Spendable = 200.
    // Target = 2500, current = 2000, gap = 500, clip = 250. But only 200 spendable.
    const portfolio = makePortfolio({ cash: 1200, portfolioValue: 10000 });
    const asset = makeAsset({ currentValue: 2000 });
    const result = await rules.checkBuyDip(asset, 65000, portfolio, PID, PNAME);
    assert.ok(result, 'Should still fire (capped)');
    assert.equal(result.buyAmountUsd, 200, 'Capped at spendable above floor');
    assert.equal(result.capped, true, 'Should flag as capped');
    assert.equal(result.idealGapUsd, 500, 'Shows ideal gap');
  });

  test('Buy returns 0 when cash is exactly at the floor', async () => {
    // Portfolio value = 10000, floor = 1000. Cash = 1000. Spendable = 0.
    const portfolio = makePortfolio({ cash: 1000, portfolioValue: 10000 });
    const asset = makeAsset({ currentValue: 2000 });
    const result = await rules.checkBuyDip(asset, 65000, portfolio, PID, PNAME);
    assert.ok(result, 'Should fire (with 0 amount)');
    assert.equal(result.buyAmountUsd, 0, 'Zero spendable');
    assert.equal(result.capped, true);
  });

  test('Buy is NOT capped when cash is well above the floor', async () => {
    // Portfolio value = 10000, floor = 1000. Cash = 3000. Spendable = 2000.
    // Gap = 500, clip = 250 < 2000 → not capped.
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ currentValue: 2000 });
    const result = await rules.checkBuyDip(asset, 65000, portfolio, PID, PNAME);
    assert.ok(result);
    assert.equal(result.buyAmountUsd, 250);
    assert.equal(result.capped, false, 'Should not be capped');
  });

  test('getSpendableCash returns 0 when cash is below floor', async () => {
    const portfolio = { cash: 500, portfolioValue: 10000 };
    assert.equal(rules.getSpendableCash(portfolio), 0);
  });

  test('getSpendableCash returns cash - floor when above', async () => {
    const portfolio = { cash: 3000, portfolioValue: 10000 };
    assert.equal(rules.getSpendableCash(portfolio), 2000);
  });
});

// ══════════════════════════════════════════════════════════════
// Transition-only alerts (I6)
// ══════════════════════════════════════════════════════════════

describe('Transition-only alerts (I6)', () => {
  beforeEach(() => mockStore._clear());

  test('BUY DIP does not re-alert a standing condition', async () => {
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ currentValue: 2000 });

    // price = 65000 < avgCost = 70000 → fires
    const r1 = await rules.checkBuyDip(asset, 65000, portfolio, PID, PNAME);
    assert.ok(r1, 'First fires');

    // Still below cost → should not re-alert
    const r2 = await rules.checkBuyDip(asset, 64000, portfolio, PID, PNAME);
    assert.equal(r2, null, 'Same condition should not re-alert');
  });

  test('BUY DIP re-arms after recovery', async () => {
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ currentValue: 2000 });

    const r1 = await rules.checkBuyDip(asset, 65000, portfolio, PID, PNAME);
    assert.ok(r1, 'First fires');

    // Price recovers above avg cost → clears alert
    await rules.clearBuyDipIfRecovered(asset, 72000, portfolio, PID);

    // Drop again below cost
    const r2 = await rules.checkBuyDip(asset, 65000, portfolio, PID, PNAME);
    assert.ok(r2, 'Should fire again after recovery');
  });

  test('SKIM does not re-alert same reference', async () => {
    const asset = makeAsset({
      avgCost: 100, lastActionPrice: 100, holdingsUsd: 1000,
    });
    const r1 = await rules.checkSkim(asset, 121, PID, PNAME);
    assert.ok(r1, 'First fires');

    const r2 = await rules.checkSkim(asset, 125, PID, PNAME);
    assert.equal(r2, null, 'Same reference should not re-alert');
  });
});

// ══════════════════════════════════════════════════════════════
// Crash Brake — full §A.5 coverage
// ══════════════════════════════════════════════════════════════

describe('Crash Brake (§A.5)', () => {
  beforeEach(() => mockStore._clear());

  // §A.5.1: Does NOT trigger on just 1 close below MA
  test('Does NOT trigger on 1 close below MA', async () => {
    // Only the last close is below — first is above
    const r = await rules.checkCrashBrake([51000, 48000], 50000, PID, PNAME, true);
    assert.equal(r, null, 'Needs 2 consecutive closes below');
  });

  // §A.5.2: Triggers on 2 consecutive closes below 200wMA
  test('Triggers de-risk on 2 consecutive closes below 200wMA', async () => {
    const r = await rules.checkCrashBrake([49000, 48000], 50000, PID, PNAME, true);
    assert.ok(r);
    assert.equal(r.type, 'CRASH_BRAKE');
    assert.equal(r.action, 'deRisk');
  });

  // §A.5.3: Weight shifts — crypto 25%→12.5%, gold gets +18.75%, total weights = 81.25% (rest → cash)
  test('applyCrashBrakeWeights: crypto halves, gold boosted, total = 81.25%', () => {
    const assets = [
      { symbol: 'BTC',  class: 'liquid', weight: 0.25 },
      { symbol: 'ETH',  class: 'liquid', weight: 0.25 },
      { symbol: 'SOL',  class: 'liquid', weight: 0.25 },
      { symbol: 'XAUT', class: 'liquid', weight: 0.25 },
    ];
    const shifted = rules.applyCrashBrakeWeights(assets);
    // Each crypto: 0.25 → 0.125
    assert.equal(shifted.find(a => a.symbol === 'BTC').weight, 0.125);
    assert.equal(shifted.find(a => a.symbol === 'ETH').weight, 0.125);
    assert.equal(shifted.find(a => a.symbol === 'SOL').weight, 0.125);
    // Gold: 0.25 + (3 × 0.125 / 2) = 0.25 + 0.1875 = 0.4375
    const goldWeight = shifted.find(a => a.symbol === 'XAUT').weight;
    assert.ok(Math.abs(goldWeight - 0.4375) < 1e-10, `Gold should be 0.4375, got ${goldWeight}`);
    // Total: 0.125 × 3 + 0.4375 = 0.8125 (81.25%), the rest is implicit cash
    const total = shifted.reduce((s, a) => s + a.weight, 0);
    assert.ok(Math.abs(total - 0.8125) < 1e-10, `Total should be 0.8125, got ${total}`);
  });

  // §A.5.4: Re-risks on first weekly close back above 200wMA
  test('Re-risks on first close above 200wMA', async () => {
    await rules.checkCrashBrake([49000, 48000], 50000, PID, PNAME, true);
    const r = await rules.checkCrashBrake([48000, 51000], 50000, PID, PNAME, true);
    assert.ok(r);
    assert.equal(r.action, 'reRisk');
  });

  // §A.5.5: Default OFF — disabled portfolio never de-risks
  test('Disabled portfolio never de-risks regardless of BTC', async () => {
    const r = await rules.checkCrashBrake([40000, 30000], 50000, PID, PNAME, false);
    assert.equal(r, null, 'Should do nothing when disabled');
  });

  // §A.5.6: Buy uses shifted target when brake is ON
  test('Buy uses shifted targets when brake is active', async () => {
    // Normal target = 0.25 × 10000 = 2500. Shifted target = 0.125 × 10000 = 1250.
    // Asset currentValue = 2000 → 60% above shifted target → over-concentrated → no buy.
    const assets = [
      { symbol: 'BTC',  class: 'liquid', weight: 0.25, holdingsUsd: 2000, avgCost: 70000, currentValue: 2000 },
      { symbol: 'XAUT', class: 'liquid', weight: 0.25, holdingsUsd: 2000, avgCost: 2700, currentValue: 2000 },
    ];
    const shifted = rules.applyCrashBrakeWeights(assets);
    const portfolio = { capital: 10000, cash: 3000, portfolioValue: 10000, assetCount: 2, assets: shifted };
    const btc = shifted.find(a => a.symbol === 'BTC');
    // price = 65000 < avgCost = 70000 (dip trigger met), BUT shifted target = 1250, currentValue = 2000 → 60% above → blocked
    const buyResult = await rules.checkBuyDip(btc, 65000, portfolio, PID, PNAME);
    assert.equal(buyResult, null, 'No buy — above shifted target (over-concentrated)');
  });

  // §A.5.7: Skim still fires when brake is ON (shifted targets don't block skims)
  test('Skim still fires when crash brake is active', async () => {
    const assets = [
      { symbol: 'SOL', class: 'liquid', weight: 0.25, holdingsUsd: 1000, avgCost: 100, lastActionPrice: 100, currentValue: 1210 },
      { symbol: 'XAUT', class: 'liquid', weight: 0.25, holdingsUsd: 1000, avgCost: 2700, currentValue: 1000 },
    ];
    const shifted = rules.applyCrashBrakeWeights(assets);
    const sol = shifted.find(a => a.symbol === 'SOL');
    // Skim doesn't use portfolio targets — it checks lastActionPrice
    const skimResult = await rules.checkSkim(sol, 121, PID, PNAME);
    assert.ok(skimResult, 'Skim fires regardless of brake');
    assert.equal(skimResult.type, 'SKIM');
  });

  // §A.5.8: Does not re-alert standing de-risk (I6)
  test('Does not re-alert standing de-risk (I6)', async () => {
    await rules.checkCrashBrake([49000, 48000], 50000, PID, PNAME, true);
    const r = await rules.checkCrashBrake([47000, 46000], 50000, PID, PNAME, true);
    assert.equal(r, null, 'Should not re-alert');
  });

  // §A.5.9: applyCrashBrakeWeights does not mutate originals
  test('applyCrashBrakeWeights does not mutate original assets', () => {
    const assets = [
      { symbol: 'BTC', class: 'liquid', weight: 0.25 },
      { symbol: 'XAUT', class: 'liquid', weight: 0.25 },
    ];
    const origWeights = assets.map(a => a.weight);
    rules.applyCrashBrakeWeights(assets);
    assert.deepEqual(assets.map(a => a.weight), origWeights, 'Originals untouched');
  });
});

// ══════════════════════════════════════════════════════════════
// Monthly summary
// ══════════════════════════════════════════════════════════════

describe('Monthly summary', () => {
  beforeEach(() => mockStore._clear());

  test('Fires on 1st of month', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 6, 1) });
    const portfolio = makePortfolio();
    const prices = { BTC: 70000, ETH: 2600, SOL: 72, XAUT: 2700 };
    const r = await rules.checkMonthly(portfolio, prices, PID, PNAME);
    assert.ok(r);
    assert.equal(r.type, 'MONTHLY');
    assert.ok(r.message.includes('MONTHLY REVIEW'));
  });

  test('Does NOT fire on non-1st', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 6, 15) });
    const portfolio = makePortfolio();
    const prices = { BTC: 70000 };
    const r = await rules.checkMonthly(portfolio, prices, PID, PNAME);
    assert.equal(r, null);
  });
});

// ══════════════════════════════════════════════════════════════
// No exchange credentials (I8)
// ══════════════════════════════════════════════════════════════

describe('No exchange credentials (I8)', () => {
  test('No exchange write/trade credential in codebase', async () => {
    const { execSync } = await import('node:child_process');
    const root = new URL('..', import.meta.url).pathname;
    let matches = '';
    try {
      matches = execSync(
        `grep -rl -E "(EXCHANGE_SECRET|BINANCE_KEY|place_order|submit_order|create_order|withdraw_crypto)" "${root}" --include="*.js" --include="*.mjs" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=tests`,
        { encoding: 'utf-8' },
      ).trim();
    } catch {
      // exit code 1 = no matches
    }
    assert.equal(matches, '', `Exchange credentials found: ${matches}`);
  });
});

// ══════════════════════════════════════════════════════════════
// Pure math helpers
// ══════════════════════════════════════════════════════════════

describe('Sizing math', () => {
  test('getTargetValue = weight × capital', () => {
    const asset = { weight: 0.25 };
    const portfolio = { capital: 20000, assetCount: 4 };
    assert.equal(rules.getTargetValue(asset, portfolio), 5000);
  });

  test('getDeviation correct', () => {
    assert.ok(Math.abs(rules.getDeviation(2250, 2500) - (-0.10)) < 1e-10, 'Should be -10%');
    assert.ok(Math.abs(rules.getDeviation(3000, 2500) - 0.20) < 1e-10, 'Should be +20%');
    assert.equal(rules.getDeviation(2500, 2500), 0, 'On target = 0');
  });

  test('No hardcoded dollar literal in rules.js (I7)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'lib', 'rules.js'), 'utf8');
    // Match standalone numbers that look like hardcoded dollar amounts (100+)
    // Exclude: 0.xx percentages, line numbers, array indices, format specifiers, Date math
    const dollarLiterals = code.match(/(?<!\.)(?<!\d)\b(1[5-9]\d{2}|[2-9]\d{3}|\d{5,})\b(?![\.\d])/g);
    // Filter out legitimate non-dollar numbers (86400000 = ms/day used in date math)
    const suspicious = (dollarLiterals || []).filter(n => !['86400000'].includes(n));
    assert.equal(suspicious.length, 0, `Found suspicious dollar literals: ${suspicious}`);
  });
});

// ══════════════════════════════════════════════════════════════
// I9: AI wording layer — never computes sizes or triggers
// ══════════════════════════════════════════════════════════════

describe('I9 — AI wording layer', () => {
  test('Template fallback preserves exact numbers from signal', async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const { phraseSignal } = await import('../lib/ai-wording.js');
      const signal = {
        type: 'BUY_DIP',
        asset: 'BTC',
        discount: 0.15,
        deviation: -0.15,
        buyAmountUsd: 375,
        idealGapUsd: 375,
        capped: false,
      };
      const text = await phraseSignal(signal);
      assert.ok(text.includes('375'), 'Dollar amount preserved in template');
      assert.ok(text.includes('15.0%'), 'Percentage preserved in template');
    } finally {
      if (saved) process.env.OPENROUTER_API_KEY = saved;
    }
  });

  test('AI prompt explicitly prohibits computing amounts', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'lib', 'ai-wording.js'), 'utf8');
    assert.ok(code.includes('Do NOT compute'), 'Prompt forbids computing');
    assert.ok(code.includes('do NOT change any numbers'), 'Prompt forbids changing numbers');
  });

  test('addReason does not mutate signal numeric fields', async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const { addReason } = await import('../lib/ai-wording.js');
      const signal = {
        type: 'SKIM',
        asset: 'ETH',
        gainFromAction: 0.25,
        skimValueUsd: 150,
        skimCoins: 0.05,
      };
      const original = { ...signal };
      await addReason(signal);
      assert.equal(signal.gainFromAction, original.gainFromAction, 'gainFromAction unchanged');
      assert.equal(signal.skimValueUsd, original.skimValueUsd, 'skimValueUsd unchanged');
      assert.equal(signal.skimCoins, original.skimCoins, 'skimCoins unchanged');
      assert.ok(signal.reason, 'reason field added');
    } finally {
      if (saved) process.env.OPENROUTER_API_KEY = saved;
    }
  });
});

// ══════════════════════════════════════════════════════════════
// I10: Every signal shows $ amount + plain-language reason
// ══════════════════════════════════════════════════════════════

describe('I10 — Every signal shows $ + reason', () => {
  beforeEach(() => mockStore._clear());

  test('formatSignalWithReason includes both reason and message', async () => {
    const { formatSignalWithReason } = await import('../lib/ai-wording.js');
    const signal = {
      type: 'BUY_DIP',
      reason: 'BTC dipped below target — buying to rebalance.',
      message: 'BUY $375 of BTC at $65,000',
    };
    const output = formatSignalWithReason(signal);
    assert.ok(output.includes(signal.reason), 'Includes reason');
    assert.ok(output.includes(signal.message), 'Includes message');
    assert.ok(output.includes('$'), 'Contains dollar sign');
  });

  test('BUY_DIP message contains dollar amount', async () => {
    // price=65000 < avgCost=70000 → dip buy fires
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ currentValue: 2000 });
    const r = await rules.checkBuyDip(asset, 65000, portfolio, PID, PNAME);
    assert.ok(r.message.includes('$'), 'BUY message has $');
  });

  test('SKIM message contains dollar amount', async () => {
    const asset = makeAsset({
      avgCost: 100, lastActionPrice: 100, holdingsUsd: 1000, currentValue: 1210,
    });
    const r = await rules.checkSkim(asset, 121, PID, PNAME);
    assert.ok(r.message.includes('$'), 'SKIM message has $');
  });
});

// ══════════════════════════════════════════════════════════════
// I11: Multi-portfolio independence
// ══════════════════════════════════════════════════════════════

describe('I11 — Multi-portfolio independence', () => {
  beforeEach(() => mockStore._clear());

  test('Two portfolios fire BUY independently for same coin', async () => {
    // Both below cost (price=65000 < avgCost=70000), both below target
    const portfolioA = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const portfolioB = makePortfolio({ capital: 15000, cash: 5000, portfolioValue: 15000 });
    const assetA = makeAsset({ currentValue: 2000 });
    const assetB = makeAsset({ currentValue: 3000 });

    const rA = await rules.checkBuyDip(assetA, 65000, portfolioA, 'pfA', 'Alpha');
    assert.ok(rA, 'Portfolio A fires');

    const rB = await rules.checkBuyDip(assetB, 65000, portfolioB, 'pfB', 'Beta');
    assert.ok(rB, 'Portfolio B fires independently');
  });

  test('Alerting PF-A does not suppress PF-B (I6 per-portfolio)', async () => {
    const portfolio = makePortfolio({ cash: 3000, portfolioValue: 10000 });
    const asset = makeAsset({ currentValue: 2000 });

    // Fire and suppress PF-A (price=65000 < avgCost=70000)
    await rules.checkBuyDip(asset, 65000, portfolio, 'pfA', 'Alpha');
    const rA2 = await rules.checkBuyDip(asset, 64000, portfolio, 'pfA', 'Alpha');
    assert.equal(rA2, null, 'PF-A suppressed (I6)');

    // PF-B should still fire
    const rB = await rules.checkBuyDip(asset, 65000, portfolio, 'pfB', 'Beta');
    assert.ok(rB, 'PF-B fires — not suppressed by PF-A');
  });

  test('Crash brake state is per-portfolio', async () => {
    await rules.checkCrashBrake([49000, 48000], 50000, 'pfA', 'Alpha', true);
    const rB = await rules.checkCrashBrake([49000, 48000], 50000, 'pfB', 'Beta', true);
    assert.ok(rB, 'PF-B de-risks independently');
    assert.equal(rB.action, 'deRisk');
  });
});

// ══════════════════════════════════════════════════════════════
// Add-money — capital change recomputes targets
// ══════════════════════════════════════════════════════════════

describe('Add-money recompute', () => {
  beforeEach(() => mockStore._clear());

  test('Adding capital increases target and triggers buy when price is below cost', async () => {
    // price = 70000 = avgCost → no buy (not a dip)
    const pBefore = makePortfolio({ capital: 8000, cash: 2000, portfolioValue: 8000 });
    const asset = makeAsset({ currentValue: 2000 });
    const rBefore = await rules.checkBuyDip(asset, 70000, pBefore, PID, PNAME);
    assert.equal(rBefore, null, 'No buy when price = avg cost');

    // User adds $4000 AND price dips below cost → fires
    mockStore._clear();
    const pAfter = makePortfolio({ capital: 12000, cash: 6000, portfolioValue: 12000 });
    // price = 65000 < avgCost = 70000, target = 3000, current = 2000, gap = 1000, clip = 500
    const rAfter = await rules.checkBuyDip(asset, 65000, pAfter, PID, PNAME);
    assert.ok(rAfter, 'Buy fires after adding capital + price dip');
    assert.equal(rAfter.buyAmountUsd, 500, 'Clip = half of gap (1000) = 500');
  });
});

// ══════════════════════════════════════════════════════════════
// I5: AQUARI safe sell calculator (microcap sleeve)
// ══════════════════════════════════════════════════════════════

describe('I5 — AQUARI safe sell calculator', () => {
  beforeEach(() => mockStore._clear());

  // Helper: build mock reserves hex for RPC response
  function mockRpcResult(wethRaw, aquariRaw) {
    const r0 = wethRaw.toString(16).padStart(64, '0');
    const r1 = aquariRaw.toString(16).padStart(64, '0');
    return '0x' + r0 + r1 + '0'.repeat(64);
  }

  // Helper: mock fetch for both RPC + GeckoTerminal
  function mockFetch({ rpcReserves, dexVolume, dexChange = 25, dexLiquidity = 5000 }) {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (typeof url === 'string' && (url.includes('base.org') || url.includes('llamarpc') || url.includes('1rpc'))) {
        return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: rpcReserves }) };
      }
      if (typeof url === 'string' && url.includes('geckoterminal')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              attributes: {
                volume_usd: { h24: String(dexVolume) },
                price_change_percentage: { h24: String(dexChange) },
                base_token_price_usd: '0.002',
                reserve_in_usd: String(dexLiquidity),
              },
            },
          }),
        };
      }
      return origFetch(url);
    };
    return origFetch;
  }

  test('Slippage stays under 1.5% cap (I5)', async () => {
    const { computeSafeSellSize } = await import('../lib/aquari.js');
    // Pool: 1M AQUARI + 1 WETH, generous volume
    const result = computeSafeSellSize({
      aquariReserve: BigInt(1_000_000) * BigInt(10 ** 18),
      wethReserve: BigInt(10 ** 18),
      volume24hUsd: 10000,
      ethPriceUsd: 2000,
      maxSlippagePct: 0.015,
      volumeCapPct: 0.20,
    });
    assert.ok(result.actualSlippage <= 0.015, `Slippage ${result.actualSlippage} exceeds 1.5%`);
    assert.ok(result.actualSlippage > 0, 'Should have some slippage');
    assert.ok(result.safeSellUsd > 0, 'Should suggest a non-zero sell');
    assert.equal(result.limitingFactor, 'slippage');
  });

  test('Capped at 20% of volume when volume is small (I5)', async () => {
    const { computeSafeSellSize } = await import('../lib/aquari.js');
    const result = computeSafeSellSize({
      aquariReserve: BigInt(1_000_000) * BigInt(10 ** 18),
      wethReserve: BigInt(10 ** 18),
      volume24hUsd: 100,
      ethPriceUsd: 2000,
      maxSlippagePct: 0.015,
      volumeCapPct: 0.20,
    });
    // Volume cap = 100 × 0.20 = $20, slippage limit ≈ $30
    assert.ok(Math.abs(result.safeSellUsd - 20) < 0.01, `Expected ~$20, got ${result.safeSellUsd}`);
    assert.equal(result.limitingFactor, 'volume');
    // Slippage at volume-capped size should be UNDER max
    assert.ok(result.actualSlippage < 0.015, 'Slippage at capped size should be under max');
  });

  test('Safe sell message includes $ and reasoning', async () => {
    const { checkAquariSell } = await import('../lib/aquari.js');
    const wethRaw = BigInt(10 ** 18);
    const aquariRaw = BigInt(1_000_000) * BigInt(10 ** 18);
    const origFetch = mockFetch({
      rpcReserves: mockRpcResult(wethRaw, aquariRaw),
      dexVolume: 5000,
      dexChange: 25,
    });
    try {
      const result = await checkAquariSell(
        { symbol: 'AQUARI', holdingsUsd: 500, avgCost: 0.001, class: 'microcap' },
        { ETH: 2000 }, PID, PNAME,
      );
      assert.ok(result, 'Should return a result');
      assert.equal(result.error, false);
      assert.ok(result.message.includes('$'), 'Message shows dollar amount');
      assert.ok(result.message.includes('Slippage'), 'Shows slippage');
      assert.ok(result.message.includes('volume'), 'Shows volume context');
      assert.ok(result.message.includes('depth') || result.message.includes('Pool depth'), 'Shows depth');
      assert.ok(result.message.includes('Principal'), 'Shows principal recovered');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('RPC failure → error signal saying don\'t trade', async () => {
    const { checkAquariSell } = await import('../lib/aquari.js');
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('Network timeout'); };
    try {
      const result = await checkAquariSell(
        { symbol: 'AQUARI', holdingsUsd: 500, avgCost: 0.001, class: 'microcap' },
        { ETH: 2000 }, PID, PNAME,
      );
      assert.ok(result, 'Should return an error result');
      assert.equal(result.error, true);
      assert.ok(result.message.includes("Don't trade"), 'Tells user not to trade');
      assert.equal(result.safeSellUsd, 0, 'Suggests $0');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('Dead volume / thin pool → returns null (no tiny clip)', async () => {
    const { checkAquariSell } = await import('../lib/aquari.js');
    const wethRaw = BigInt(10 ** 18);
    const aquariRaw = BigInt(1_000_000) * BigInt(10 ** 18);
    const origFetch = mockFetch({
      rpcReserves: mockRpcResult(wethRaw, aquariRaw),
      dexVolume: 10,        // dead volume ($10)
      dexChange: 50,        // pump trigger met
      dexLiquidity: 100,    // thin liquidity
    });
    try {
      const result = await checkAquariSell(
        { symbol: 'AQUARI', holdingsUsd: 500, avgCost: 0.001, class: 'microcap' },
        { ETH: 2000 }, PID, PNAME,
      );
      assert.equal(result, null, 'Should skip — no tiny clip');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
