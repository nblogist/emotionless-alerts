import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { DEFAULT_CONFIG } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = (await store.get('config')) || DEFAULT_CONFIG;
  const coins = Object.keys(config.coins);

  const rules = {};
  for (const coin of coins) {
    rules[`buyBand:${coin}`] = !!(await store.get(`alerted:buyBand:${coin}`));
    rules[`sellTrigger:${coin}`] = ((await store.get(`sellLevel:${coin}`)) || 0) > 0;
    const dz = await store.get(`drawdownZone:${coin}`);
    rules[`drawdown:${coin}`] = dz || null;
    rules[`floorConfirmed:${coin}`] = !!(await store.get(`alerted:floorConfirmed:${coin}`));
  }
  rules.thesisBreak = !!(await store.get('alerted:thesisBreak'));
  rules.upsideBreak = !!(await store.get('alerted:upsideBreak'));

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
