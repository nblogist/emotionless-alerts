import { NextResponse } from 'next/server';
import { COIN_IDS } from '@/lib/defaults';
import * as store from '@/lib/store';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function headers() {
  const h = {};
  if (process.env.COINGECKO_KEY) h['x-cg-demo-api-key'] = process.env.COINGECKO_KEY;
  return h;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const coin = (searchParams.get('coin') || '').toUpperCase();
  const days = parseInt(searchParams.get('days') || '30', 10);

  if (!coin || !COIN_IDS[coin]) {
    return NextResponse.json({ error: `Unknown coin: ${coin}` }, { status: 400 });
  }
  if (![7, 30, 90].includes(days)) {
    return NextResponse.json({ error: 'days must be 7, 30, or 90' }, { status: 400 });
  }

  const cacheKey = `chart:${coin}:${days}`;

  try {
    // Check cache
    const cached = await store.get(cacheKey);
    if (cached?.prices && cached?.fetchedAt) {
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({ prices: cached.prices });
      }
    }

    const id = COIN_IDS[coin];
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`,
      { headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(15000) }
    );

    if (!res.ok) {
      // Return stale cache on upstream error
      if (cached?.prices) return NextResponse.json({ prices: cached.prices });
      return NextResponse.json({ error: `CoinGecko returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const prices = data.prices || [];

    await store.set(cacheKey, { prices, fetchedAt: new Date().toISOString() });

    return NextResponse.json({ prices });
  } catch (e) {
    // Return stale cache on error
    const cached = await store.get(cacheKey);
    if (cached?.prices) return NextResponse.json({ prices: cached.prices });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
