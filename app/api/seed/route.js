import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { DEFAULT_CONFIG, DEFAULT_PORTFOLIOS } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

// POST /api/seed — one-time import of transactions for a portfolio
export async function POST(request) {
  try {
    const { portfolio, transactions, totalCapital, reserveRemaining } = await request.json();
    const pid = portfolio || 'corolla';

    // Ensure portfolios list exists
    const existing = await store.get('portfolios');
    if (!existing) {
      await store.set('portfolios', DEFAULT_PORTFOLIOS);
    }

    // Coerce transaction amounts to numbers
    const safeTxns = transactions.map(t => ({
      ...t,
      amount: Number(t.amount),
      pricePerCoin: Number(t.pricePerCoin),
    }));

    // Store transactions
    await store.set(`transactions:${pid}`, safeTxns);

    // Build config from transactions
    let config = (await store.get(`config:${pid}`)) || { ...DEFAULT_CONFIG };
    if (totalCapital) config.totalCapital = totalCapital;
    if (reserveRemaining !== undefined) config.reserveRemaining = reserveRemaining;

    // Recalculate from transactions
    const coinNames = Object.keys(config.coins);
    for (const coin of coinNames) {
      const coinTxns = safeTxns.filter((t) => t.coin === coin);
      if (coinTxns.length === 0) {
        config.coins[coin] = { holdingsUsd: 0, avgCost: 0, buyReference: 0 };
        continue;
      }
      const buys = coinTxns.filter((t) => t.type === 'buy');
      const sells = coinTxns.filter((t) => t.type === 'sell');
      const totalBought = buys.reduce((s, t) => s + t.amount, 0);
      const totalSold = sells.reduce((s, t) => s + t.amount, 0);
      const totalHeld = totalBought - totalSold;
      const totalSpent = buys.reduce((s, t) => s + t.amount * t.pricePerCoin, 0);
      const avgCost = totalBought > 0 ? totalSpent / totalBought : 0;
      const lastBuy = buys[buys.length - 1];
      config.coins[coin] = {
        holdingsUsd: totalHeld * avgCost,
        avgCost,
        buyReference: lastBuy ? lastBuy.pricePerCoin : 0,
      };
    }

    const totalHoldings = Object.values(config.coins).reduce((s, c) => s + c.holdingsUsd, 0);
    config.powderRemaining = config.totalCapital - totalHoldings - (config.reserveRemaining || 0);

    await store.set(`config:${pid}`, config);

    return NextResponse.json({ ok: true, config, transactionCount: safeTxns.length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
