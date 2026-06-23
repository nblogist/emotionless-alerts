import { NextResponse } from 'next/server';
import * as store from '@/lib/store';

export const dynamic = 'force-dynamic';

// GET — return alerts with statuses merged in
export async function GET() {
  const alerts = await store.lrange('alertHistory', 0, 49);
  const statuses = (await store.get('alertStatuses')) || {};

  const merged = alerts.map((a) => {
    const id = a.id || `legacy-${a.time}-${(a.portfolio || '').slice(0, 4)}`;
    return {
      ...a,
      id,
      status: statuses[id] || a.status || 'pending',
    };
  });

  return NextResponse.json(merged);
}

// PATCH — update status of one alert
export async function PATCH(request) {
  const { id, status } = await request.json();
  if (!id || !['pending', 'done', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid id or status' }, { status: 400 });
  }

  const statuses = (await store.get('alertStatuses')) || {};
  statuses[id] = status;
  await store.set('alertStatuses', statuses);

  return NextResponse.json({ ok: true, id, status });
}
