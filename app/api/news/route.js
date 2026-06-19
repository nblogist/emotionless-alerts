import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { fetchMarketNews } from '@/lib/news';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Try cached AI analysis first (set by cron job)
    const cached = await store.get('aiNewsAnalysis');
    if (cached?.analysis?.length > 0) {
      const age = Date.now() - new Date(cached.timestamp).getTime();
      // Use cached AI analysis if less than 2 hours old
      if (age < 2 * 60 * 60 * 1000) {
        return NextResponse.json(cached.analysis);
      }
    }

    // Fallback to keyword-filtered news
    const news = await fetchMarketNews();
    return NextResponse.json(news);
  } catch (e) {
    console.error('News API error:', e.message);
    return NextResponse.json([], { status: 500 });
  }
}
