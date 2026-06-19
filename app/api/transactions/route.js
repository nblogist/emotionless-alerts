export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { DEFAULT_CONFIG } from '@/lib/defaults';

function recalculateConfig(config, transactions) {
  const coinNames = Object.keys(config.coins);

  for (const coin of coinNames) {
    const coinTxns = transactions.filter((t) => t.coin === coin);

    if (coinTxns.length === 0) {
      config.coins[coin].holdingsUsd = 0;
      config.coins[coin].avgCost = 0;
      config.coins[coin].buyReference = 0;
      continue;
    }

    const buys = coinTxns.filter((t) => t.type === 'buy');
    const sells = coinTxns.filter((t) => t.type === 'sell');

    const totalCoinsBought = buys.reduce((sum, t) => sum + t.amount, 0);
    const totalCoinsSold = sells.reduce((sum, t) => sum + t.amount, 0);
    const totalCoinsHeld = totalCoinsBought - totalCoinsSold;

    const totalUsdSpentOnBuys = buys.reduce(
      (sum, t) => sum + t.amount * t.pricePerCoin,
      0
    );

    const avgCost = totalCoinsBought > 0 ? totalUsdSpentOnBuys / totalCoinsBought : 0;
    const holdingsUsd = totalCoinsHeld * avgCost;

    const lastBuy = buys.length > 0 ? buys[buys.length - 1] : null;
    const buyReference = lastBuy ? lastBuy.pricePerCoin : 0;

    config.coins[coin].holdingsUsd = holdingsUsd;
    config.coins[coin].avgCost = avgCost;
    config.coins[coin].buyReference = buyReference;
  }

  const totalHoldingsUsd = Object.values(config.coins).reduce(
    (sum, coin) => sum + coin.holdingsUsd,
    0
  );

  config.powderRemaining =
    config.totalCapital - totalHoldingsUsd - config.reserveRemaining;

  return config;
}

export async function GET(request) {
  try {
    const pid = request.nextUrl.searchParams.get('portfolio') || 'furqan';
    const transactions = (await store.get(`transactions:${pid}`)) || (await store.get('transactions')) || [];
    return NextResponse.json(transactions);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { coin, type, amount, pricePerCoin, date, portfolio } = body;
    const pid = portfolio || 'furqan';

    if (!coin || !type || !amount || !pricePerCoin) {
      return NextResponse.json(
        { error: 'Missing required fields: coin, type, amount, pricePerCoin' },
        { status: 400 }
      );
    }

    if (type !== 'buy' && type !== 'sell') {
      return NextResponse.json(
        { error: 'Type must be "buy" or "sell"' },
        { status: 400 }
      );
    }

    const transaction = {
      coin,
      type,
      amount,
      pricePerCoin,
      date: date || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };

    const transactions = (await store.get(`transactions:${pid}`)) || [];
    transactions.push(transaction);
    await store.set(`transactions:${pid}`, transactions);

    let config = (await store.get(`config:${pid}`)) || { ...DEFAULT_CONFIG };

    if (!config.coins[coin]) {
      config.coins[coin] = { holdingsUsd: 0, avgCost: 0, buyReference: 0 };
    }

    config = recalculateConfig(config, transactions);
    await store.set(`config:${pid}`, config);

    return NextResponse.json({ success: true, transaction, config });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to add transaction' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const { index, portfolio } = body;
    const pid = portfolio || 'furqan';

    if (index === undefined || index === null) {
      return NextResponse.json(
        { error: 'Missing required field: index' },
        { status: 400 }
      );
    }

    const transactions = (await store.get(`transactions:${pid}`)) || [];

    if (index < 0 || index >= transactions.length) {
      return NextResponse.json(
        { error: 'Index out of bounds' },
        { status: 400 }
      );
    }

    transactions.splice(index, 1);
    await store.set(`transactions:${pid}`, transactions);

    let config = (await store.get(`config:${pid}`)) || { ...DEFAULT_CONFIG };
    config = recalculateConfig(config, transactions);
    await store.set(`config:${pid}`, config);

    return NextResponse.json({ success: true, transactions, config });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete transaction' },
      { status: 500 }
    );
  }
}
