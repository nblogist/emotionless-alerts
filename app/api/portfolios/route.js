import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { DEFAULT_PORTFOLIOS, DEFAULT_CONFIG } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

export async function GET() {
  const portfolios = (await store.get('portfolios')) || DEFAULT_PORTFOLIOS;
  return NextResponse.json(portfolios);
}

export async function POST(request) {
  try {
    const { name, telegramChatId, alertEmail, stablecoin } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30);
    const portfolios = (await store.get('portfolios')) || DEFAULT_PORTFOLIOS;
    if (portfolios.some((p) => p.id === id)) {
      return NextResponse.json({ error: 'Portfolio with this name already exists' }, { status: 400 });
    }
    const portfolio = { id, name, telegramChatId: telegramChatId || '', alertEmail: alertEmail || '', stablecoin: stablecoin || '' };
    portfolios.push(portfolio);
    await store.set('portfolios', portfolios);
    // Seed default config for new portfolio
    await store.set(`config:${id}`, { ...DEFAULT_CONFIG });
    return NextResponse.json({ ok: true, portfolio });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { id, name, telegramChatId, alertEmail, stablecoin } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const portfolios = (await store.get('portfolios')) || DEFAULT_PORTFOLIOS;
    const idx = portfolios.findIndex((p) => p.id === id);
    if (idx === -1) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
    if (name) portfolios[idx].name = name;
    if (telegramChatId !== undefined) portfolios[idx].telegramChatId = telegramChatId;
    if (alertEmail !== undefined) portfolios[idx].alertEmail = alertEmail;
    if (stablecoin !== undefined) portfolios[idx].stablecoin = stablecoin;
    await store.set('portfolios', portfolios);
    return NextResponse.json({ ok: true, portfolio: portfolios[idx] });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id } = await request.json();
    const portfolios = (await store.get('portfolios')) || DEFAULT_PORTFOLIOS;
    const filtered = portfolios.filter((p) => p.id !== id);
    if (filtered.length === portfolios.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await store.set('portfolios', filtered);
    await store.del(`config:${id}`);
    await store.del(`transactions:${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
