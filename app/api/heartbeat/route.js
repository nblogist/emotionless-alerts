import { NextResponse } from 'next/server';
import * as store from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/heartbeat — health check endpoint.
 * Returns cron freshness status. Hook this up to UptimeRobot, BetterStack,
 * or any external monitor to detect when cron stops firing.
 */
export async function GET() {
  const lastRun = await store.get('lastCronRun');
  const pricesFetchedAt = await store.get('pricesFetchedAt');
  const redisHealth = await store.ping();
  const now = new Date();

  if (!lastRun) {
    return NextResponse.json({
      status: 'unknown',
      lastRun: null,
      redis: redisHealth.ok ? 'connected' : redisHealth.reason,
      message: 'No cron run recorded yet.',
    });
  }

  const gapMs = now.getTime() - new Date(lastRun).getTime();
  const gapHours = Math.round(gapMs / (3600 * 1000) * 10) / 10;

  const status = gapHours > 24 ? 'stale' : gapHours > 4 ? 'warning' : 'healthy';

  return NextResponse.json({
    status,
    lastRun,
    pricesFetchedAt: pricesFetchedAt || null,
    gapHours,
    redis: redisHealth.ok ? 'connected' : redisHealth.reason,
    message: status === 'stale'
      ? `Last run was ${gapHours}h ago — cron may not be firing.`
      : status === 'warning'
        ? `Last run was ${gapHours}h ago — check if cron schedule is correct.`
        : `Healthy — last run ${gapHours}h ago.`,
  });
}
