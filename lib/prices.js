import { COIN_IDS } from './defaults.js';

function headers() {
  const h = {};
  if (process.env.COINGECKO_KEY) h['x-cg-demo-api-key'] = process.env.COINGECKO_KEY;
  return h;
}

export async function getLivePrices() {
  const ids = Object.values(COIN_IDS).join(',');
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`CoinGecko price error: ${res.status}`);
  const data = await res.json();
  const prices = {};
  for (const [sym, id] of Object.entries(COIN_IDS)) {
    prices[sym] = data[id]?.usd ?? null;
  }
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
