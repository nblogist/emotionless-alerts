import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { DEFAULT_CONFIG } from '@/lib/defaults';
import { migrateConfig } from '@/lib/config-migrate';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const pid = request.nextUrl.searchParams.get('portfolio') || 'corolla';
  const raw = (await store.get(`config:${pid}`)) || (await store.get('config')) || DEFAULT_CONFIG;
  const config = migrateConfig(raw);
  return NextResponse.json(config);
}

export async function PUT(request) {
  try {
    const pid = request.nextUrl.searchParams.get('portfolio') || 'corolla';
    const config = await request.json();
    await store.set(`config:${pid}`, config);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
