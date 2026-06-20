import { NextResponse } from 'next/server';
import * as store from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/audit?portfolio=…&limit=50
 * Returns the most recent audit log entries (sent + suppressed signals).
 */
export async function GET(request) {
  const { searchParams } = request.nextUrl;
  const portfolio = searchParams.get('portfolio');
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

  const entries = await store.lrange('auditLog', 0, limit - 1);

  const filtered = portfolio
    ? entries.filter(e => e.portfolio === portfolio)
    : entries;

  return NextResponse.json(filtered);
}
