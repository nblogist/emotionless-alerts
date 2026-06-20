import { NextResponse } from 'next/server';
import { fetchHistoricalPrices } from '@/lib/prices';
import * as store from '@/lib/store';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'price-history';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function GET() {
  try {
    // Check cache first
    const cached = await store.get(CACHE_KEY);
    if (cached?.data && cached?.fetchedAt) {
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json(cached.data);
      }
    }

    const data = await fetchHistoricalPrices();

    // Cache the result
    await store.set(CACHE_KEY, { data, fetchedAt: new Date().toISOString() });

    return NextResponse.json(data);
  } catch (e) {
    // Return cached data on error even if stale
    const cached = await store.get(CACHE_KEY);
    if (cached?.data) return NextResponse.json(cached.data);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
