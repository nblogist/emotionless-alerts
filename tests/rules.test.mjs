import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../lib/rules.js';
import * as mockStore from './mock-store.js';

// --- Helpers ---

function makeConfig(overrides = {}) {
  const base = {
    totalCapital: 15000,
    perCoinCap: 5000,
    powderRemaining: 7500,
    reserveRemaining: 1500,
    buyBandPct: 0.07,
    rungSizes: [400, 600, 700, 800],
    sellTrimPct: 0.15,
    trimMultiples: [2.0, 3.0, 4.0],
    trailingStopPct: 0.30,
    trailingStopSellPct: 0.25,
    upsideBreakMult: 1.20,
    upsideDeployPct: 0.40,
    drawdownZones: [-0.20, -0.35, -0.50],
    coins: {
      BTC: { holdingsUsd: 2000, avgCost: 64000, buyReference: 64000 },
    },
    ...overrides,
  };
  // Deep-merge coins if provided
  if (overrides.coins) base.coins = { ...overrides.coins };
  return base;
}

const PID = 'test';
const PNAME = 'Test';

// --- Reset store between every test ---

beforeEach(() => mockStore._clear());

// ============================================================
// §4 Verification checklist
// ============================================================

describe('§4 Checklist', () => {

  // 1. Buy rung 1 alerts at price = buyReference × 0.93, amount $400
  test('Buy rung 1 alerts at buyReference × 0.93, amount $400', async () => {
    const config = makeConfig({
      coins: { BTC: { holdingsUsd: 0, avgCost: 64000, buyReference: 64000 } },
    });
    const price = 64000 * (1 - 0.07); // at threshold (same formula as code)
    const result = await rules.checkBuyBand('BTC', price, config, PID, PNAME);
    assert.ok(result !== null, 'Rung 1 should fire');
    assert.ok(result.includes('Rung 1'), 'Should say Rung 1');
    assert.ok(result.includes('$400'), 'Amount should be $400');
  });

  // 2. Rungs escalate 400→600→700→800, then STOP at $5k deployed (I2)
  test('Rungs escalate 400→600→700→800 then stop', async () => {
    const config = makeConfig({
      coins: { BTC: { holdingsUsd: 0, avgCost: 64000, buyReference: 64000 } },
    });
    const price = 64000 * 0.92;
    const expected = [400, 600, 700, 800];

    for (let i = 0; i < 4; i++) {
      await mockStore.set(`alerted:${PID}:buyBand:BTC`, false);
      const r = await rules.checkBuyBand('BTC', price, config, PID, PNAME);
      assert.ok(r !== null, `Rung ${i + 1} should fire`);
      assert.ok(r.includes(`Rung ${i + 1}`), `Should say Rung ${i + 1}`);
      assert.ok(r.includes(`$${expected[i]}`), `Amount should be $${expected[i]}`);
      config.coins.BTC.holdingsUsd += expected[i];
    }

    // 5th call — rungs exhausted
    await mockStore.set(`alerted:${PID}:buyBand:BTC`, false);
    const r = await rules.checkBuyBand('BTC', price, config, PID, PNAME);
    assert.strictEqual(r, null, 'No rung after all 4 filled');
  });

  // 3. Two triggers in one run → only ONE rung fires (I4)
  test('I4: max 1 buy alert per coin per run', async () => {
    const config = makeConfig({
      coins: { BTC: { holdingsUsd: 0, avgCost: 64000, buyReference: 64000 } },
    });
    const price = 64000 * 0.92;

    const r1 = await rules.checkBuyBand('BTC', price, config, PID, PNAME);
    assert.ok(r1 !== null, 'First call fires');

    const r2 = await rules.checkBuyBand('BTC', price, config, PID, PNAME);
    assert.strictEqual(r2, null, 'Second call in same run must not fire');
  });

  // 4. dd = −40% → buy ladder PAUSES; no rung fires (I5)
  test('I5: paused in −35% zone, buy rung blocked', async () => {
    const config = makeConfig({
      coins: { BTC: { holdingsUsd: 0, avgCost: 64000, buyReference: 64000 } },
    });
    await mockStore.set(`drawdownZone:${PID}:BTC`, '35');
    const price = 64000 * 0.92;
    const r = await rules.checkBuyBand('BTC', price, config, PID, PNAME);
    assert.strictEqual(r, null, 'Buy must not fire in pause zone');
  });

  // 5. Reserve fires only after 2 weekly closes above drawdown low (I6)
  test('I6: floor confirmed fires only in crash zone with 2 closes above low', async () => {
    const config = makeConfig();

    // Not in 35/50 zone → should not fire
    const closes = [100, 80, 60, 50, 55, 56];
    const r1 = await rules.checkFloorConfirmed('BTC', closes, config, PID, PNAME);
    assert.strictEqual(r1, null, 'Should not fire outside crash zone');

    // In 50 zone → should fire (last 2 closes above min)
    await mockStore.set(`drawdownZone:${PID}:BTC`, '50');
    const r2 = await rules.checkFloorConfirmed('BTC', closes, config, PID, PNAME);
    assert.ok(r2 !== null, 'Floor confirmed should fire in 50 zone');
    assert.ok(r2.includes('FLOOR CONFIRMED'));

    // Does not re-fire
    const r3 = await rules.checkFloorConfirmed('BTC', closes, config, PID, PNAME);
    assert.strictEqual(r3, null, 'Should not re-alert floor confirmed');
  });

  // 6. Sell baseline locks at avgCost×2.0; trims fire at ×2.0, ×3.0, ×4.0, 15% each
  test('Sell baseline locks at 2x; trims at 2x / 3x / 4x, 15% each', async () => {
    const config = makeConfig({
      coins: { BTC: { holdingsUsd: 2000, avgCost: 100, buyReference: 100 } },
    });

    // Price at 2x → baseline locks + trim 1
    const r1 = await rules.checkSellTrigger('BTC', 200, config, PID, PNAME);
    assert.ok(r1 !== null, 'Trim 1 should fire at 2x');
    assert.ok(r1.includes('Trim 1'));
    assert.ok(r1.includes('15%'));
    const baseline = await mockStore.get(`sellBaseline:${PID}:BTC`);
    assert.strictEqual(baseline, 20, 'Baseline should lock at 20 units (2000/100)');

    // Trim 2 at 3x
    const r2 = await rules.checkSellTrigger('BTC', 300, config, PID, PNAME);
    assert.ok(r2 !== null, 'Trim 2 should fire at 3x');
    assert.ok(r2.includes('Trim 2'));

    // Trim 3 at 4x
    const r3 = await rules.checkSellTrigger('BTC', 400, config, PID, PNAME);
    assert.ok(r3 !== null, 'Trim 3 should fire at 4x');
    assert.ok(r3.includes('Trim 3'));
  });

  // 7. After 3 trims, no further trim fires
  test('After 3 trims, no further trim fires', async () => {
    const config = makeConfig({
      coins: { BTC: { holdingsUsd: 2000, avgCost: 100, buyReference: 100 } },
    });
    await mockStore.set(`sellBaseline:${PID}:BTC`, 20);
    await mockStore.set(`trimsDone:${PID}:BTC`, 3);
    await mockStore.set(`peakSinceGreen:${PID}:BTC`, 500); // keep peak = price so TS won't fire

    const r = await rules.checkSellTrigger('BTC', 500, config, PID, PNAME);
    assert.strictEqual(r, null, 'No trim should fire after 3 done');
  });

  // 8. Trailing stop sells 25% at price ≤ peak×0.70, resets peak, can fire again (I7)
  test('I7: trailing stop at peak×0.70, sells 25%, resets peak, re-fires', async () => {
    const config = makeConfig({
      coins: { BTC: { holdingsUsd: 2000, avgCost: 100, buyReference: 100 } },
    });
    await mockStore.set(`sellBaseline:${PID}:BTC`, 20);
    await mockStore.set(`trimsDone:${PID}:BTC`, 3);
    await mockStore.set(`peakSinceGreen:${PID}:BTC`, 1000);

    // Drop to peak × 0.70 = 700
    const r1 = await rules.checkSellTrigger('BTC', 700, config, PID, PNAME);
    assert.ok(r1 !== null, 'Trailing stop should fire');
    assert.ok(r1.includes('TRAILING STOP'));
    assert.ok(r1.includes('25%'));

    // Peak should reset to 700
    const peak = await mockStore.get(`peakSinceGreen:${PID}:BTC`);
    assert.strictEqual(peak, 700, 'Peak should reset to current price');

    // Can fire again at 700 × 0.70 = 490 (use 489 to avoid fp boundary)
    const r2 = await rules.checkSellTrigger('BTC', 489, config, PID, PNAME);
    assert.ok(r2 !== null, 'Trailing stop should re-fire at new threshold');
    assert.ok(r2.includes('TRAILING STOP'));
  });

  // 9. Thesis break at 2 weekly closes below 200wMA; re-entry at 1 close above
  test('Thesis break fires at 2 closes below MA; resumes at 1 above', async () => {
    const ma200 = 50000;

    // 2 closes below
    const r1 = await rules.checkThesisBreak([49000, 48000], ma200, PID, PNAME);
    assert.ok(r1 !== null, 'Thesis break should fire');
    assert.ok(r1.includes('THESIS BREAK'));
    assert.strictEqual(await mockStore.get(`thesisStop:${PID}`), true);

    // 1 close above → resume
    const r2 = await rules.checkThesisBreak([48000, 51000], ma200, PID, PNAME);
    assert.ok(r2 !== null, 'Resume alert should fire');
    assert.ok(r2.includes('RESUMED'));
    assert.strictEqual(await mockStore.get(`thesisStop:${PID}`), false);
  });

  // 10. Upside break fires once at BTC close > 1.20×200wMA; deploys 40%
  test('Upside break fires once, deploys 40% of powder', async () => {
    const ma200 = 50000;
    const config = makeConfig();
    const prices = { BTC: 61000, ETH: 2700, SOL: 75, AQUARI: 0.01, XAUT: 2700 };
    const closes = [61000]; // above 50000 × 1.20 = 60000

    const r1 = await rules.checkUpsideBreak(closes, ma200, config, PID, PNAME, prices);
    assert.ok(r1 !== null, 'Upside break should fire');
    assert.ok(r1.includes('UPSIDE BREAKOUT'));
    assert.ok(r1.includes('40%'));

    // Must not fire again
    const r2 = await rules.checkUpsideBreak(closes, ma200, config, PID, PNAME, prices);
    assert.strictEqual(r2, null, 'Upside break must fire only once');
  });

  // 11. 1st-of-month summary sends even when nothing else fires
  test('Monthly summary fires on the 1st', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) });

    const config = makeConfig();
    const prices = { BTC: 65000 };
    const r = await rules.checkMonthly(config, prices, PID, PNAME);
    assert.ok(r !== null, 'Monthly should fire on 1st');
    assert.ok(r.includes('MONTHLY REVIEW'));
  });

  test('Monthly does NOT fire on non-1st', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 15) });

    const config = makeConfig();
    const prices = { BTC: 65000 };
    const r = await rules.checkMonthly(config, prices, PID, PNAME);
    assert.strictEqual(r, null, 'Monthly must not fire on the 15th');
  });

  // 12. Same standing condition does NOT re-alert next run (I8)
  test('I8: standing condition does not re-alert', async () => {
    const ma200 = 50000;
    const closes = [49000, 48000];

    const r1 = await rules.checkThesisBreak(closes, ma200, PID, PNAME);
    assert.ok(r1 !== null, 'First alert fires');

    // Same condition next run
    const r2 = await rules.checkThesisBreak(closes, ma200, PID, PNAME);
    assert.strictEqual(r2, null, 'Must not re-alert same standing condition');
  });

  // 13. No exchange write/trade credential anywhere in the codebase (I9)
  test('I9: no exchange write/trade credentials in codebase', async () => {
    const { execSync } = await import('node:child_process');
    const root = new URL('..', import.meta.url).pathname;
    let matches = '';
    try {
      matches = execSync(
        `grep -rl -E "(EXCHANGE_SECRET|BINANCE_KEY|place_order|submit_order|create_order|withdraw_crypto)" "${root}" --include="*.js" --include="*.mjs" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=tests`,
        { encoding: 'utf-8' },
      ).trim();
    } catch {
      // exit code 1 = no matches — exactly what we want
    }
    assert.strictEqual(matches, '', `Exchange credentials found in: ${matches}`);
  });

  // 14. Caps hold after every simulated fill (I1, I2)
  test('I1: total capital cap blocks buy when exceeded', async () => {
    const config = makeConfig({
      totalCapital: 15000,
      reserveRemaining: 1500,
      coins: {
        BTC: { holdingsUsd: 4500, avgCost: 64000, buyReference: 64000 },
        ETH: { holdingsUsd: 4500, avgCost: 2600, buyReference: 2600 },
        SOL: { holdingsUsd: 4500, avgCost: 72, buyReference: 72 },
      },
    });
    // totalDeployed=13500, deploy=400, reserve=1500 → 15400 > 15000
    const r = await rules.checkBuyBand('BTC', 64000 * 0.92, config, PID, PNAME);
    assert.strictEqual(r, null, 'I1 should block: 13500 + 400 + 1500 > 15000');
  });

  test('I2: per-coin cap blocks buy when exceeded', async () => {
    const config = makeConfig({
      coins: { BTC: { holdingsUsd: 4700, avgCost: 64000, buyReference: 64000 } },
    });
    // 4700 + 400 = 5100 > 5000
    const r = await rules.checkBuyBand('BTC', 64000 * 0.92, config, PID, PNAME);
    assert.strictEqual(r, null, 'I2 should block: 4700 + 400 > 5000');
  });

  test('I2: buy allowed when exactly at cap', async () => {
    const config = makeConfig({
      coins: { BTC: { holdingsUsd: 4600, avgCost: 64000, buyReference: 64000 } },
    });
    // 4600 + 400 = 5000 ≤ 5000
    const r = await rules.checkBuyBand('BTC', 64000 * 0.92, config, PID, PNAME);
    assert.ok(r !== null, 'Should fire: 4600 + 400 = 5000 is within cap');
  });
});

// ============================================================
// Drawdown zone boundary tests — prove dd sign-flip equivalence
// ============================================================

describe('Drawdown zones', () => {
  const HIGH = 100000;

  beforeEach(async () => {
    mockStore._clear();
    await mockStore.set('cycleHigh:BTC', HIGH);
  });

  test('dd formula: price/high−1 equals −(high−price)/high', () => {
    const cases = [
      { price: 80000, high: HIGH, expected: -0.20 },
      { price: 65000, high: HIGH, expected: -0.35 },
      { price: 50000, high: HIGH, expected: -0.50 },
      { price: 100000, high: HIGH, expected: 0 },
      { price: 120000, high: HIGH, expected: 0.20 },
    ];

    for (const { price, high, expected } of cases) {
      const newDD = price / high - 1;
      const oldDD = (high - price) / high; // always ≥ 0 for drops
      assert.ok(
        Math.abs(newDD - expected) < 1e-10,
        `new formula at price ${price}: got ${newDD}, want ${expected}`,
      );
      assert.ok(
        Math.abs(newDD + oldDD) < 1e-10,
        `new + old should cancel: ${newDD} + ${oldDD}`,
      );
    }
  });

  test('at −20% boundary: enters 20 zone', async () => {
    const config = makeConfig();
    // price/high−1 at exact 0.80 hits fp rounding; use 79999 to be clearly inside
    const price = HIGH * 0.80 - 1;
    const r = await rules.checkDrawdownZone('BTC', price, config, PID, PNAME);
    assert.ok(r !== null, 'Should fire at −20%');
    assert.ok(r.includes('DIP'), 'Should be the DIP zone');
  });

  test('just above −20%: no zone', async () => {
    const config = makeConfig();
    const price = HIGH * 0.81; // dd = −0.19
    const r = await rules.checkDrawdownZone('BTC', price, config, PID, PNAME);
    assert.strictEqual(r, null, 'Should not fire above −20%');
  });

  test('exactly −35%: enters 35 zone (deep dip)', async () => {
    const config = makeConfig();
    const price = HIGH * 0.65; // dd = −0.35
    const r = await rules.checkDrawdownZone('BTC', price, config, PID, PNAME);
    assert.ok(r !== null, 'Should fire at exactly −35%');
    assert.ok(r.includes('DEEP DIP'));
  });

  test('between −35% and −50%: 35 zone, not 50', async () => {
    const config = makeConfig();
    const price = HIGH * 0.60; // dd = −0.40
    const r = await rules.checkDrawdownZone('BTC', price, config, PID, PNAME);
    assert.ok(r !== null);
    assert.ok(r.includes('DEEP DIP'), 'At −40% should be deep dip, not crash');
  });

  test('exactly −50%: enters 50 zone (crash)', async () => {
    const config = makeConfig();
    const price = HIGH * 0.50; // dd = −0.50
    const r = await rules.checkDrawdownZone('BTC', price, config, PID, PNAME);
    assert.ok(r !== null, 'Should fire at exactly −50%');
    assert.ok(r.includes('CRASH'));
  });

  test('below −50%: still 50 zone', async () => {
    const config = makeConfig();
    const price = HIGH * 0.40; // dd = −0.60
    const r = await rules.checkDrawdownZone('BTC', price, config, PID, PNAME);
    assert.ok(r !== null);
    assert.ok(r.includes('CRASH'));
  });

  test('zone transition alerts; same zone does not re-alert', async () => {
    const config = makeConfig();

    // Enter 20 zone (use price just inside boundary)
    const r1 = await rules.checkDrawdownZone('BTC', HIGH * 0.80 - 1, config, PID, PNAME);
    assert.ok(r1 !== null, 'First entry alerts');

    // Same zone again → no alert
    const r2 = await rules.checkDrawdownZone('BTC', HIGH * 0.78, config, PID, PNAME);
    assert.strictEqual(r2, null, 'Same zone must not re-alert');

    // Transition to 35 zone → alerts
    const r3 = await rules.checkDrawdownZone('BTC', HIGH * 0.65, config, PID, PNAME);
    assert.ok(r3 !== null, 'Zone transition should alert');
  });

  test('thesisStop blocks buy rung', async () => {
    const config = makeConfig({
      coins: { BTC: { holdingsUsd: 0, avgCost: 64000, buyReference: 64000 } },
    });
    await mockStore.set(`thesisStop:${PID}`, true);
    const r = await rules.checkBuyBand('BTC', 64000 * 0.92, config, PID, PNAME);
    assert.strictEqual(r, null, 'Buy must not fire during thesis stop');
  });
});
