import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { DEFAULT_CONFIG } from '@/lib/defaults';
import { migrateConfig } from '@/lib/config-migrate';

export const dynamic = 'force-dynamic';

/**
 * One-time migration: compute initialCash from transactions so cash
 * reflects all past buys/sells. Runs once per portfolio, then persists.
 */
async function ensureInitialCash(config, pid) {
  if (config.initialCash !== undefined) return config;

  const transactions = (await store.get(`transactions:${pid}`)) || [];
  if (transactions.length === 0) return config;

  const totalBuySpend = transactions
    .filter(t => t.type === 'buy')
    .reduce((sum, t) => sum + t.amount * t.pricePerCoin, 0);
  const totalSellProceeds = transactions
    .filter(t => t.type === 'sell')
    .reduce((sum, t) => sum + t.amount * t.pricePerCoin, 0);

  config.initialCash = (config.cash || 0) + totalBuySpend - totalSellProceeds;
  config.cash = config.initialCash - totalBuySpend + totalSellProceeds;

  const totalHoldings = (config.assets || []).reduce((sum, a) => sum + (a.holdingsUsd || 0), 0);
  config.capital = config.cash + totalHoldings;

  await store.set(`config:${pid}`, config);
  return config;
}

export async function GET(request) {
  const pid = request.nextUrl.searchParams.get('portfolio') || 'corolla';
  const raw = (await store.get(`config:${pid}`)) || (await store.get('config')) || DEFAULT_CONFIG;
  let config = migrateConfig(raw);
  config = await ensureInitialCash(config, pid);
  return NextResponse.json(config);
}

export async function PUT(request) {
  try {
    const pid = request.nextUrl.searchParams.get('portfolio') || 'corolla';
    let config = await request.json();

    // Re-derive cash & capital from transactions so manual edits can't drift
    const transactions = (await store.get(`transactions:${pid}`)) || [];
    if (transactions.length > 0 && config.initialCash !== undefined) {
      const totalBuySpend = transactions
        .filter(t => t.type === 'buy')
        .reduce((sum, t) => sum + t.amount * t.pricePerCoin, 0);
      const totalSellProceeds = transactions
        .filter(t => t.type === 'sell')
        .reduce((sum, t) => sum + t.amount * t.pricePerCoin, 0);
      config.cash = config.initialCash - totalBuySpend + totalSellProceeds;
      const totalHoldings = (config.assets || []).reduce((sum, a) => sum + (a.holdingsUsd || 0), 0);
      config.capital = config.cash + totalHoldings;
    }

    await store.set(`config:${pid}`, config);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
