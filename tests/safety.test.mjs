import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateSignal, getSignalAmount } from '../lib/validate-signal.js';

// ══════════════════════════════════════════════════════════════
// Batch 6 — Money-math safety guards
// Signal validation, audit logging, fill-confirmation echo
// ══════════════════════════════════════════════════════════════

// ── Helpers ──

function makePortfolio(overrides = {}) {
  return {
    capital: 10000,
    cash: 3000,
    portfolioValue: 10000,
    assets: [
      { symbol: 'BTC', class: 'liquid', weight: 0.25, currentValue: 2500 },
      { symbol: 'ETH', class: 'liquid', weight: 0.25, currentValue: 2500 },
      { symbol: 'SOL', class: 'liquid', weight: 0.25, currentValue: 2500 },
      { symbol: 'XAUT', class: 'liquid', weight: 0.25, currentValue: 2500 },
    ],
    ...overrides,
  };
}

// ── Signal sanity-check (I12) ───────────────────────────────

describe('I12 — Signal sanity-check (validateSignal)', () => {

  test('Rejects NaN amount', () => {
    const signal = { type: 'BUY_DIP', asset: 'BTC', buyAmountUsd: NaN };
    const r = validateSignal(signal, makePortfolio());
    assert.equal(r.valid, false);
    assert.ok(r.reason.includes('impossible'));
  });

  test('Rejects negative amount', () => {
    const signal = { type: 'SKIM', asset: 'ETH', skimValueUsd: -50 };
    const r = validateSignal(signal, makePortfolio());
    assert.equal(r.valid, false);
    assert.ok(r.reason.includes('impossible'));
  });

  test('Rejects Infinity amount', () => {
    const signal = { type: 'BIG_TRIM', asset: 'SOL', trimValueUsd: Infinity };
    const r = validateSignal(signal, makePortfolio());
    assert.equal(r.valid, false);
    assert.ok(r.reason.includes('impossible'));
  });

  test('Rejects null amount (unknown signal type)', () => {
    const signal = { type: 'BUY_DIP', asset: 'BTC', buyAmountUsd: null };
    const r = validateSignal(signal, makePortfolio());
    assert.equal(r.valid, false);
    assert.ok(r.reason.includes('impossible'));
  });

  test('Rejects buy exceeding spendable cash', () => {
    // portfolioValue = 10000, floor = 1000, cash = 1500, spendable = 500
    const portfolio = makePortfolio({ cash: 1500 });
    const signal = { type: 'BUY_DIP', asset: 'BTC', buyAmountUsd: 600 };
    const r = validateSignal(signal, portfolio);
    assert.equal(r.valid, false);
    assert.ok(r.reason.includes('spendable cash'));
  });

  test('Rejects sell exceeding holdings', () => {
    const portfolio = makePortfolio();
    // ETH currentValue = 2500, trying to sell 3000
    const signal = { type: 'SKIM', asset: 'ETH', skimValueUsd: 3000 };
    const r = validateSignal(signal, portfolio);
    assert.equal(r.valid, false);
    assert.ok(r.reason.includes('exceeds holdings'));
  });

  test('Rejects amount exceeding portfolio value', () => {
    const portfolio = makePortfolio({ portfolioValue: 10000 });
    const signal = { type: 'BIG_TRIM', asset: 'BTC', trimValueUsd: 15000 };
    const r = validateSignal(signal, portfolio);
    assert.equal(r.valid, false);
    assert.ok(r.reason.includes('exceeds total portfolio'));
  });

  test('Passes valid BUY_DIP signal', () => {
    const portfolio = makePortfolio({ cash: 3000 });
    const signal = { type: 'BUY_DIP', asset: 'BTC', buyAmountUsd: 300 };
    const r = validateSignal(signal, portfolio);
    assert.equal(r.valid, true);
  });

  test('Passes zero-amount signal (capped buy at floor)', () => {
    const signal = { type: 'BUY_DIP', asset: 'BTC', buyAmountUsd: 0 };
    const r = validateSignal(signal, makePortfolio());
    assert.equal(r.valid, true);
  });

  test('CRASH_BRAKE skips dollar validation', () => {
    const signal = { type: 'CRASH_BRAKE', action: 'deRisk' };
    const r = validateSignal(signal, makePortfolio());
    assert.equal(r.valid, true);
  });

  test('MONTHLY skips dollar validation', () => {
    const signal = { type: 'MONTHLY' };
    const r = validateSignal(signal, makePortfolio());
    assert.equal(r.valid, true);
  });

  test('null signal passes (no signal = no problem)', () => {
    const r = validateSignal(null, makePortfolio());
    assert.equal(r.valid, true);
  });

  test('MICROCAP_SELL error signal passes', () => {
    const signal = { type: 'MICROCAP_SELL', error: true, safeSellUsd: 0 };
    const r = validateSignal(signal, makePortfolio());
    assert.equal(r.valid, true);
  });

  test('Buy within 1% tolerance of spendable cash passes', () => {
    // portfolioValue = 10000, floor = 1000, cash = 1500, spendable = 500
    // 500 * 1.01 + 0.01 = 505.01. Buy of 505 should pass.
    const portfolio = makePortfolio({ cash: 1500 });
    const signal = { type: 'BUY_DIP', asset: 'BTC', buyAmountUsd: 505 };
    const r = validateSignal(signal, portfolio);
    assert.equal(r.valid, true, 'Within 1% tolerance');
  });
});

// ── getSignalAmount extraction ──────────────────────────────

describe('getSignalAmount', () => {
  test('Extracts buyAmountUsd for BUY_DIP', () => {
    assert.equal(getSignalAmount({ type: 'BUY_DIP', buyAmountUsd: 300 }), 300);
  });
  test('Extracts skimValueUsd for SKIM', () => {
    assert.equal(getSignalAmount({ type: 'SKIM', skimValueUsd: 150 }), 150);
  });
  test('Extracts trimValueUsd for BIG_TRIM', () => {
    assert.equal(getSignalAmount({ type: 'BIG_TRIM', trimValueUsd: 600 }), 600);
  });
  test('Extracts safeSellUsd for MICROCAP_SELL', () => {
    assert.equal(getSignalAmount({ type: 'MICROCAP_SELL', safeSellUsd: 50 }), 50);
  });
  test('Returns null for unknown type', () => {
    assert.equal(getSignalAmount({ type: 'CRASH_BRAKE' }), null);
  });
});

// ── Audit log structural checks ─────────────────────────────

describe('Audit log — cron wiring', () => {
  test('Cron route uses processSignal + validateSignal for all signals', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'app', 'api', 'cron', 'route.js'), 'utf8');
    assert.ok(code.includes("import { validateSignal, getSignalAmount }"), 'Imports validator');
    assert.ok(code.includes('processSignal'), 'Uses processSignal helper');
    assert.ok(code.includes("store.lpush('auditLog'"), 'Writes to auditLog');
    assert.ok(code.includes('suppressedReason'), 'Records suppression reason');
    assert.ok(code.includes('dataFreshness'), 'Records data freshness');
  });

  test('Audit API endpoint exists and reads auditLog', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'app', 'api', 'audit', 'route.js'), 'utf8');
    assert.ok(code.includes("'auditLog'"), 'Reads from auditLog');
    assert.ok(code.includes('portfolio'), 'Supports portfolio filter');
    assert.ok(code.includes('limit'), 'Supports limit parameter');
  });
});

// ── Fill-confirmation echo structural checks ────────────────

describe('Fill-confirmation echo', () => {
  test('Settings page has confirmation modal and jump detection', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'app', 'settings', 'page.js'), 'utf8');
    assert.ok(code.includes('computeChanges'), 'Has change diff logic');
    assert.ok(code.includes('savedConfig'), 'Stores snapshot for diffing');
    assert.ok(code.includes('fillJumpWarningPct') || code.includes('safetyGuards'), 'Uses configurable thresholds');
    assert.ok(code.includes('Confirm'), 'Has confirmation gate');
  });

  test('Safety guard thresholds are in STRATEGY_CONFIG (not hardcoded)', async () => {
    const { STRATEGY_CONFIG } = await import('../lib/defaults.js');
    assert.ok(STRATEGY_CONFIG.safetyGuards, 'safetyGuards section exists');
    assert.equal(STRATEGY_CONFIG.safetyGuards.fillJumpWarningPct, 0.30, 'Fill jump threshold = 30%');
    assert.equal(STRATEGY_CONFIG.safetyGuards.avgCostVsPriceWarningPct, 0.50, 'Avg cost warning = 50%');
  });
});
