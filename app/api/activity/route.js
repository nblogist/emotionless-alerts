import { NextResponse } from 'next/server';
import * as store from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const log = await store.lrange('activityLog', 0, 199);
    return NextResponse.json(log);
  } catch (e) {
    // If key has wrong type, delete and start fresh
    await store.del('activityLog');
    return NextResponse.json([]);
  }
}
