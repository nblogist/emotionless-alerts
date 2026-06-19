import { NextResponse } from 'next/server';
import * as store from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const log = (await store.get('activityLog')) || [];
    return NextResponse.json(log);
  } catch (e) {
    return NextResponse.json([], { status: 500 });
  }
}
