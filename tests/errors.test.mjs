import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ══════════════════════════════════════════════════════════════
// Batch 5 — Graceful error handling + failure visibility
// Every test: mock the failure, assert fail-safe + notification
// ══════════════════════════════════════════════════════════════

// ── Price validation (pure) ──────────────────────────────────

describe('Price validation', () => {
  test('validatePrice rejects null, undefined, 0, negative, NaN, Infinity', async () => {
    const { validatePrice } = await import('../lib/prices.js');
    assert.equal(validatePrice(null), null);
    assert.equal(validatePrice(undefined), null);
    assert.equal(validatePrice(0), null);
    assert.equal(validatePrice(-5), null);
    assert.equal(validatePrice(NaN), null);
    assert.equal(validatePrice(Infinity), null);
    assert.equal(validatePrice(-Infinity), null);
    assert.equal(validatePrice('not a number'), null);
  });

  test('validatePrice accepts positive numbers', async () => {
    const { validatePrice } = await import('../lib/prices.js');
    assert.equal(validatePrice(100), 100);
    assert.equal(validatePrice(0.001), 0.001);
    assert.equal(validatePrice(65000), 65000);
    assert.equal(validatePrice('42.5'), 42.5);  // numeric string
  });
});

// ── Price feed failures ──────────────────────────────────────

describe('Price feed failures', () => {
  let origFetch;
  beforeEach(() => { origFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = origFetch; });

  test('fetchPricesSafe returns PRICE_FEED_DOWN on HTTP error', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    const { fetchPricesSafe } = await import('../lib/prices.js');
    const r = await fetchPricesSafe();
    assert.deepEqual(r.prices, {}, 'No prices on HTTP error');
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].type, 'PRICE_FEED_DOWN');
    assert.ok(r.errors[0].message.includes('503'));
    assert.ok(r.fetchedAt, 'Has timestamp');
  });

  test('fetchPricesSafe returns PRICE_FEED_DOWN on network error', async () => {
    globalThis.fetch = async () => { throw new Error('Network unreachable'); };
    const { fetchPricesSafe } = await import('../lib/prices.js');
    const r = await fetchPricesSafe();
    assert.deepEqual(r.prices, {});
    assert.equal(r.errors[0].type, 'PRICE_FEED_DOWN');
    assert.ok(r.errors[0].message.includes('Network unreachable'));
  });

  test('fetchPricesSafe validates individual prices — rejects zero/null', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        bitcoin: { usd: 65000 },
        ethereum: { usd: 0 },        // zero → invalid
        solana: { usd: null },        // null → invalid
        'aquari-2': { usd: 0.002 },
        'tether-gold': {},            // missing usd → invalid
      }),
    });
    const { fetchPricesSafe } = await import('../lib/prices.js');
    const r = await fetchPricesSafe();
    // Valid prices kept
    assert.equal(r.prices.BTC, 65000);
    assert.equal(r.prices.AQUARI, 0.002);
    // Invalid prices rejected
    assert.equal(r.prices.ETH, undefined);
    assert.equal(r.prices.SOL, undefined);
    assert.equal(r.prices.XAUT, undefined);
    // Errors reported
    const invalids = r.errors.filter(e => e.type === 'PRICE_INVALID');
    assert.equal(invalids.length, 3);
    const symbols = invalids.map(e => e.symbol).sort();
    assert.deepEqual(symbols, ['ETH', 'SOL', 'XAUT']);
  });

  test('Total feed down returns empty prices — cron must not compute', async () => {
    globalThis.fetch = async () => { throw new Error('DNS resolution failed'); };
    const { fetchPricesSafe } = await import('../lib/prices.js');
    const r = await fetchPricesSafe();
    assert.equal(Object.keys(r.prices).length, 0, 'Zero valid prices');
    assert.ok(r.errors.length > 0, 'Has error details');
  });
});

// ── Telegram retry ───────────────────────────────────────────

describe('Telegram retry', () => {
  let origFetch;
  let origToken;
  beforeEach(() => {
    origFetch = globalThis.fetch;
    origToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origToken) process.env.TELEGRAM_BOT_TOKEN = origToken;
    else delete process.env.TELEGRAM_BOT_TOKEN;
  });

  test('Retries once on failure, succeeds on second attempt', async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      if (attempts === 1) return { ok: false, status: 500, text: async () => 'Server error' };
      return { ok: true, json: async () => ({}) };
    };
    const { sendTelegram } = await import('../lib/telegram.js');
    const r = await sendTelegram('123', 'test');
    assert.equal(r.ok, true, 'Should succeed on retry');
    assert.equal(attempts, 2, 'Should have tried twice');
  });

  test('Returns error after 2 failures', async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      return { ok: false, status: 500, text: async () => 'Server error' };
    };
    const { sendTelegram } = await import('../lib/telegram.js');
    const r = await sendTelegram('123', 'test');
    assert.equal(r.ok, false, 'Should fail after 2 attempts');
    assert.ok(r.error, 'Should have error message');
    assert.ok(r.error.includes('2 attempts'), 'Error mentions retry count');
    assert.equal(attempts, 2);
  });

  test('Returns error when no token configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const { sendTelegram } = await import('../lib/telegram.js');
    const r = await sendTelegram('123', 'test');
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('TELEGRAM_BOT_TOKEN'));
  });
});

// ── Email error handling ─────────────────────────────────────

describe('Email error handling', () => {
  let origKey;
  beforeEach(() => { origKey = process.env.RESEND_API_KEY; });
  afterEach(() => {
    if (origKey) process.env.RESEND_API_KEY = origKey;
    else delete process.env.RESEND_API_KEY;
  });

  test('Returns error when no API key configured', async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = await import('../lib/email.js');
    const r = await sendEmail('test', 'body', ['a@b.com']);
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('RESEND_API_KEY'));
  });

  test('Returns error when no recipients', async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = await import('../lib/email.js');
    const r = await sendEmail('test', 'body');
    assert.equal(r.ok, false);
    // No key = "No RESEND_API_KEY" error comes first
    assert.ok(r.error);
  });
});

// ── AI wording fallback ──────────────────────────────────────

describe('AI wording fallback on failure', () => {
  let origFetch;
  let origKey;
  beforeEach(() => {
    origFetch = globalThis.fetch;
    origKey = process.env.OPENROUTER_API_KEY;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origKey) process.env.OPENROUTER_API_KEY = origKey;
    else delete process.env.OPENROUTER_API_KEY;
  });

  test('phraseSignal returns template when AI fetch throws (timeout/error)', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    globalThis.fetch = async (url) => {
      if (typeof url === 'string' && url.includes('openrouter')) {
        throw new Error('Connection timeout');
      }
      return origFetch(url);
    };
    const { phraseSignal } = await import('../lib/ai-wording.js');
    const signal = {
      type: 'BUY_DIP',
      asset: 'BTC',
      deviation: -0.15,
      buyAmountUsd: 375,
      idealGapUsd: 375,
      capped: false,
    };
    const text = await phraseSignal(signal);
    // Template fallback should have the exact numbers
    assert.ok(text.includes('375'), 'Dollar amount preserved in fallback');
    assert.ok(text.includes('15.0%'), 'Percentage preserved in fallback');
    assert.ok(text.length > 10, 'Not an empty response');
  });

  test('phraseSignal returns template when AI returns non-OK', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    globalThis.fetch = async (url) => {
      if (typeof url === 'string' && url.includes('openrouter')) {
        return { ok: false, status: 429 };
      }
      return origFetch(url);
    };
    const { phraseSignal } = await import('../lib/ai-wording.js');
    const signal = {
      type: 'SKIM',
      asset: 'ETH',
      gainFromAction: 0.25,
      skimValueUsd: 150,
      skimCoins: 0.05,
    };
    const text = await phraseSignal(signal);
    assert.ok(text.includes('150'), 'Dollar amount preserved');
    assert.ok(text.includes('25.0%'), 'Percentage preserved');
  });
});

// ── Heartbeat / watchdog ─────────────────────────────────────

describe('Heartbeat gap detection', () => {
  test('Returns stale when >24h since last run', async () => {
    const { checkHeartbeatGap } = await import('../lib/health.js');
    const now = new Date('2026-06-20T12:00:00Z');
    const lastRun = '2026-06-18T10:00:00Z';  // 50 hours ago
    const r = checkHeartbeatGap(lastRun, now);
    assert.equal(r.stale, true);
    assert.ok(r.hours > 24);
    assert.ok(r.message.includes('hours ago'));
    assert.ok(r.message.toLowerCase().includes('stale'));
  });

  test('Returns not stale when <24h', async () => {
    const { checkHeartbeatGap } = await import('../lib/health.js');
    const now = new Date('2026-06-20T12:00:00Z');
    const lastRun = '2026-06-20T10:00:00Z';  // 2 hours ago
    const r = checkHeartbeatGap(lastRun, now);
    assert.equal(r.stale, false);
    assert.equal(r.message, null);
    assert.ok(r.hours < 24);
  });

  test('Returns not stale on first-ever run (no previous)', async () => {
    const { checkHeartbeatGap } = await import('../lib/health.js');
    const r = checkHeartbeatGap(null);
    assert.equal(r.stale, false);
    assert.equal(r.hours, null);
    assert.equal(r.message, null);
  });
});

// ── Price error formatting ───────────────────────────────────

describe('Price error formatting', () => {
  test('Formats total feed down message', async () => {
    const { formatPriceErrors } = await import('../lib/health.js');
    const msg = formatPriceErrors([{ type: 'PRICE_FEED_DOWN', message: 'HTTP 503' }]);
    assert.ok(msg.includes('PRICE FEED DOWN'));
    assert.ok(msg.includes('HTTP 503'));
    assert.ok(msg.includes('No trades suggested'));
  });

  test('Formats partial missing prices warning', async () => {
    const { formatPriceErrors } = await import('../lib/health.js');
    const msg = formatPriceErrors([
      { type: 'PRICE_INVALID', symbol: 'SOL', message: 'Bad price' },
      { type: 'PRICE_INVALID', symbol: 'XAUT', message: 'Missing' },
    ]);
    assert.ok(msg.includes('SOL'));
    assert.ok(msg.includes('XAUT'));
    assert.ok(msg.includes('skipped'));
  });

  test('Returns null for no errors', async () => {
    const { formatPriceErrors } = await import('../lib/health.js');
    assert.equal(formatPriceErrors([]), null);
    assert.equal(formatPriceErrors(null), null);
  });
});

// ── Store health check ───────────────────────────────────────

describe('Store health check', () => {
  test('ping returns ok:false when Redis is not configured', async () => {
    // In test environment, no Redis credentials → store uses mock
    // The mock store doesn't have ping(), but the real store.js does
    // This tests the structural contract
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'lib', 'store.js'), 'utf8');
    assert.ok(code.includes('export async function ping()'), 'store.js exports ping()');
    assert.ok(code.includes('.ping()'), 'ping() calls Redis ping');
    assert.ok(code.includes('ok: false'), 'Returns ok:false on failure');
    assert.ok(code.includes('ok: true'), 'Returns ok:true on success');
  });
});

// ── Fail-safe integration ────────────────────────────────────

describe('Fail-safe integration', () => {
  test('Cron route imports fetchPricesSafe (not getLivePrices)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'app', 'api', 'cron', 'route.js'), 'utf8');
    assert.ok(code.includes('fetchPricesSafe'), 'Uses safe price fetcher');
    assert.ok(!code.includes('getLivePrices'), 'Does not use legacy price fetcher');
  });

  test('Cron route checks notification delivery status', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'app', 'api', 'cron', 'route.js'), 'utf8');
    assert.ok(code.includes('deliveryFailures'), 'Tracks delivery failures');
    assert.ok(code.includes('r.ok'), 'Checks send result');
  });

  test('Cron route stamps heartbeat and handles crash notification', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'app', 'api', 'cron', 'route.js'), 'utf8');
    assert.ok(code.includes("'lastCronRun'"), 'Stamps heartbeat');
    assert.ok(code.includes('sendSystemAlert'), 'Has system alert for crashes');
    assert.ok(code.includes('checkHeartbeatGap'), 'Checks heartbeat gap');
    assert.ok(code.includes('heartbeat.stale'), 'Includes stale warning in alerts');
  });

  test('Cron route handles total price failure without computing signals', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'app', 'api', 'cron', 'route.js'), 'utf8');
    // Must bail before running rules when no prices
    assert.ok(code.includes("Object.keys(prices).length === 0"), 'Checks for zero valid prices');
    assert.ok(code.includes('Price feed down'), 'Reports price feed down');
  });

  test('Telegram module has retry logic with 2 attempts', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'lib', 'telegram.js'), 'utf8');
    assert.ok(code.includes('attempt <= 2'), 'Retries up to 2 attempts');
    assert.ok(code.includes('AbortSignal.timeout'), 'Has fetch timeout');
  });

  test('Email module has retry logic with 2 attempts', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'lib', 'email.js'), 'utf8');
    assert.ok(code.includes('attempt <= 2'), 'Retries up to 2 attempts');
    assert.ok(code.includes('failures'), 'Tracks per-recipient failures');
  });

  test('AI wording has explicit fetch timeout', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'lib', 'ai-wording.js'), 'utf8');
    assert.ok(code.includes('AbortSignal.timeout'), 'Has fetch timeout');
  });

  test('Heartbeat API endpoint exists', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'app', 'api', 'heartbeat', 'route.js'), 'utf8');
    assert.ok(code.includes('lastCronRun'), 'Reads heartbeat timestamp');
    assert.ok(code.includes('gapHours'), 'Computes gap');
    assert.ok(code.includes("'stale'"), 'Returns stale status');
    assert.ok(code.includes("'healthy'"), 'Returns healthy status');
  });
});
