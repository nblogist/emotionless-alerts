import { COIN_IDS } from './defaults.js';

function headers() {
  const h = {};
  if (process.env.COINGECKO_KEY) h['x-cg-demo-api-key'] = process.env.COINGECKO_KEY;
  return h;
}

/**
 * Validate a single price value.
 * Returns the number if valid, null if not.
 */
export function validatePrice(val) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  if (!isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Fetch live prices with validation and error tracking.
 * Never throws — always returns a structured result.
 * @returns {{ prices: Record<string,number>, errors: Array<{type:string, message:string, symbol?:string}>, fetchedAt: string }}
 */
export async function fetchPricesSafe() {
  const errors = [];
  const fetchedAt = new Date().toISOString();

  let data;
  try {
    const ids = Object.values(COIN_IDS).join(',');
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      {
        headers: headers(),
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) {
      return {
        prices: {},
        errors: [{ type: 'PRICE_FEED_DOWN', message: `CoinGecko returned HTTP ${res.status}` }],
        fetchedAt,
      };
    }
    data = await res.json();
  } catch (e) {
    const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError';
    return {
      prices: {},
      errors: [{
        type: 'PRICE_FEED_DOWN',
        message: isTimeout
          ? 'CoinGecko request timed out (15s)'
          : `CoinGecko request failed: ${e.message}`,
      }],
      fetchedAt,
    };
  }

  // Validate each price individually
  const prices = {};
  for (const [sym, id] of Object.entries(COIN_IDS)) {
    const raw = data[id]?.usd;
    const valid = validatePrice(raw);
    if (valid !== null) {
      prices[sym] = valid;
    } else {
      errors.push({ type: 'PRICE_INVALID', symbol: sym, message: `Bad/missing price for ${sym}: ${raw}` });
    }
  }

  return { prices, errors, fetchedAt };
}

// Legacy wrapper for non-cron callers (dashboard, status API)
export async function getLivePrices() {
  const { prices } = await fetchPricesSafe();
  return prices;
}

/**
 * Fetch historical prices at specific period boundaries (24h, 7d, 30d, 90d ago).
 * Uses CoinGecko market_chart with days=90 to get all periods in one call per coin.
 * Also computes recentHighs: the highest price per coin over a trailing window.
 * Returns { '24h': {...}, '7d': {...}, '30d': {...}, '90d': {...}, recentHighs: { BTC: price, ... } }
 */
export async function fetchHistoricalPrices() {
  const { STRATEGY_CONFIG } = await import('./defaults.js');
  const windowDays = STRATEGY_CONFIG.liquidBasket.recentHighWindowDays || 30;

  const periods = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
  const now = Date.now();
  const targets = {};
  for (const [label, days] of Object.entries(periods)) {
    targets[label] = now - days * 24 * 60 * 60 * 1000;
  }
  const highWindowStart = now - windowDays * 24 * 60 * 60 * 1000;

  const result = {};
  for (const label of Object.keys(periods)) result[label] = {};
  result.recentHighs = {};

  await Promise.all(
    Object.entries(COIN_IDS).map(async ([sym, id]) => {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=90`,
          { headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(15000) }
        );
        if (!res.ok) return;
        const data = await res.json();
        const pts = data.prices || [];
        if (pts.length === 0) return;

        for (const [label, targetTs] of Object.entries(targets)) {
          let closest = pts[0];
          let minDiff = Math.abs(pts[0][0] - targetTs);
          for (const pt of pts) {
            const diff = Math.abs(pt[0] - targetTs);
            if (diff < minDiff) { closest = pt; minDiff = diff; }
          }
          result[label][sym] = closest[1];
        }

        // Recent high: max price within the trailing window
        let high = 0;
        for (const pt of pts) {
          if (pt[0] >= highWindowStart && pt[1] > high) high = pt[1];
        }
        if (high > 0) result.recentHighs[sym] = high;
      } catch {
        // Skip coin on error
      }
    })
  );

  return result;
}

function isoWeekKey(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((d - jan1) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export async function fetchWeeklyCloses(coin) {
  const id = COIN_IDS[coin];
  if (!id) throw new Error(`Unknown coin: ${coin}`);
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=1470`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`CoinGecko history error for ${coin}: ${res.status}`);
  const data = await res.json();
  const weekMap = new Map();
  for (const [ts, price] of data.prices) {
    weekMap.set(isoWeekKey(new Date(ts)), price);
  }
  return Array.from(weekMap.values());
}
