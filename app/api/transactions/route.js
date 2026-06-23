export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { DEFAULT_CONFIG } from '@/lib/defaults';
import { migrateConfig } from '@/lib/config-migrate';

/**
 * Recalculate config assets from the full transaction list.
 * Works with the NEW asset-based config format: { capital, cash, assets: [] }
 * Computes: avgCost, holdingsUsd, lastActionPrice per asset.
 * Capital = cash + sum(holdingsUsd).
 */
function recalculateConfig(config, transactions) {
  for (const asset of config.assets) {
    const coinTxns = transactions
      .filter((t) => t.coin === asset.symbol)
      .sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));

    if (coinTxns.length === 0) {
      asset.holdingsUsd = 0;
      asset.avgCost = 0;
      asset.lastActionPrice = 0;
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
    const holdingsUsd = Math.max(0, totalCoinsHeld) * avgCost;

    // lastActionPrice = price from the most recent transaction (buy or sell)
    const lastTxn = coinTxns[coinTxns.length - 1];
    const lastActionPrice = lastTxn ? lastTxn.pricePerCoin : 0;

    asset.holdingsUsd = holdingsUsd;
    asset.avgCost = avgCost;
    asset.lastActionPrice = lastActionPrice;
  }

  // Compute net cash impact from all transactions: buys subtract, sells add
  const totalBuySpend = transactions
    .filter(t => t.type === 'buy')
    .reduce((sum, t) => sum + t.amount * t.pricePerCoin, 0);
  const totalSellProceeds = transactions
    .filter(t => t.type === 'sell')
    .reduce((sum, t) => sum + t.amount * t.pricePerCoin, 0);

  // Adjust cash: start from initialCash (set once), then subtract buys, add sells
  if (config.initialCash === undefined) {
    // First time: capture current cash + all past buy spend as the starting point
    config.initialCash = (config.cash || 0) + totalBuySpend - totalSellProceeds;
  }
  config.cash = config.initialCash - totalBuySpend + totalSellProceeds;

  // Capital = cash + sum of all holdingsUsd
  const totalHoldings = config.assets.reduce((sum, a) => sum + (a.holdingsUsd || 0), 0);
  config.capital = config.cash + totalHoldings;

  return config;
}

async function loadConfig(pid) {
  const raw = (await store.get(`config:${pid}`)) || { ...DEFAULT_CONFIG };
  return migrateConfig(raw);
}

export async function GET(request) {
  try {
    const pid = request.nextUrl.searchParams.get('portfolio') || 'corolla';
    const coin = request.nextUrl.searchParams.get('coin');
    const transactions = (await store.get(`transactions:${pid}`)) || (await store.get('transactions')) || [];
    if (coin) {
      return NextResponse.json(transactions.filter(t => t.coin === coin));
    }
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
    const { coin, type, amount, pricePerCoin, date, note, portfolio } = body;
    const pid = portfolio || 'corolla';

    const numAmount = Number(amount);
    const numPrice = Number(pricePerCoin);

    if (!coin || !type || !amount || !pricePerCoin) {
      return NextResponse.json(
        { error: 'Missing required fields: coin, type, amount, pricePerCoin' },
        { status: 400 }
      );
    }

    if (isNaN(numAmount) || isNaN(numPrice) || numAmount <= 0 || numPrice <= 0) {
      return NextResponse.json(
        { error: 'amount and pricePerCoin must be positive numbers' },
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
      amount: numAmount,
      pricePerCoin: numPrice,
      date: date || new Date().toISOString().split('T')[0],
      note: note || '',
      createdAt: new Date().toISOString(),
    };

    const transactions = (await store.get(`transactions:${pid}`)) || [];
    transactions.push(transaction);
    await store.set(`transactions:${pid}`, transactions);

    let config = await loadConfig(pid);

    // Ensure asset exists in config
    if (!config.assets.find(a => a.symbol === coin)) {
      config.assets.push({
        symbol: coin,
        class: coin === 'AQUARI' ? 'microcap' : 'liquid',
        weight: 0,
        holdingsUsd: 0,
        avgCost: 0,
        lastActionPrice: 0,
      });
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

export async function PUT(request) {
  try {
    const body = await request.json();
    const { index, coin, type, amount, pricePerCoin, date, note, portfolio } = body;
    const pid = portfolio || 'corolla';

    if (index === undefined || index === null) {
      return NextResponse.json(
        { error: 'Missing required field: index' },
        { status: 400 }
      );
    }

    const numAmount = Number(amount);
    const numPrice = Number(pricePerCoin);

    if (!coin || !type || !amount || !pricePerCoin) {
      return NextResponse.json(
        { error: 'Missing required fields: coin, type, amount, pricePerCoin' },
        { status: 400 }
      );
    }

    if (isNaN(numAmount) || isNaN(numPrice) || numAmount <= 0 || numPrice <= 0) {
      return NextResponse.json(
        { error: 'amount and pricePerCoin must be positive numbers' },
        { status: 400 }
      );
    }

    if (type !== 'buy' && type !== 'sell') {
      return NextResponse.json(
        { error: 'Type must be "buy" or "sell"' },
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

    transactions[index] = {
      ...transactions[index],
      coin,
      type,
      amount: numAmount,
      pricePerCoin: numPrice,
      date: date || transactions[index].date,
      note: note !== undefined ? note : (transactions[index].note || ''),
      updatedAt: new Date().toISOString(),
    };

    await store.set(`transactions:${pid}`, transactions);

    let config = await loadConfig(pid);
    config = recalculateConfig(config, transactions);
    await store.set(`config:${pid}`, config);

    return NextResponse.json({ success: true, transaction: transactions[index], config });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update transaction' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const { index, portfolio } = body;
    const pid = portfolio || 'corolla';

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

    let config = await loadConfig(pid);
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
