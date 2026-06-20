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
