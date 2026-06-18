import { NextResponse } from 'next/server';
import { fetchMarketNews } from '@/lib/news';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const news = await fetchMarketNews();
    return NextResponse.json(news);
  } catch (e) {
    return NextResponse.json([], { status: 500 });
  }
}
