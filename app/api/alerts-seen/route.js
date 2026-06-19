import { NextResponse } from 'next/server';
import * as store from '@/lib/store';

export const dynamic = 'force-dynamic';

const KEY = 'alertsSeenAt';

export async function GET() {
  const ts = await store.get(KEY);
  return NextResponse.json({ seenAt: ts || null });
}

export async function POST() {
  const now = new Date().toISOString();
  await store.set(KEY, now);
  return NextResponse.json({ seenAt: now });
}
