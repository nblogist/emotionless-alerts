import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { DEFAULT_CONFIG } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const pid = request.nextUrl.searchParams.get('portfolio') || 'corolla';
  const config = (await store.get(`config:${pid}`)) || DEFAULT_CONFIG;
  const assets = config.assets || [];

  const rules = {};
  for (const asset of assets) {
    const sym = asset.symbol;
    rules[`buyDip:${sym}`] = !!(await store.get(`alerted:${pid}:buyDip:${sym}`));
    rules[`skim:${sym}`] = false; // skim alerts are per-reference, tracked differently
  }
  rules.crashBrake = !!(await store.get(`crashBrakeActive:${pid}`));

  const btcCloses = (await store.get('weeklyCloses:BTC')) || [];
  const ma200 =
    btcCloses.length >= 200
      ? btcCloses.slice(-200).reduce((a, b) => a + b, 0) / 200
      : null;

  const alerts = await store.lrange('alertHistory', 0, 19);
  const kvConfigured = store.isConfigured();

  return NextResponse.json({
    rules,
    ma200,
    alerts,
    kvConfigured,
    weeklyCloseCount: btcCloses.length,
  });
}
