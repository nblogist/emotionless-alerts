import { NextResponse } from 'next/server';
import { getLivePrices } from '@/lib/prices';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const prices = await getLivePrices();
    return NextResponse.json(prices);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
