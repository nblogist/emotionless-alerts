import { NextResponse } from 'next/server';
import { sendTelegram } from '@/lib/telegram';
import * as store from '@/lib/store';
import { DEFAULT_PORTFOLIOS } from '@/lib/defaults';

export async function POST(request) {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN env var not set' });
    }

    // Send test to all portfolios' chat IDs
    const portfolios = (await store.get('portfolios')) || DEFAULT_PORTFOLIOS;
    let sent = 0;
    for (const pf of portfolios) {
      const chatIds = (pf.telegramChatId || '').split(',').map(id => id.trim()).filter(Boolean);
      for (const cid of chatIds) {
        await sendTelegram(cid, `[${pf.name}] Emotionless Alerts test message. Bot is connected and working for this portfolio.`);
        sent++;
      }
    }
    return NextResponse.json({ ok: true, sentTo: sent });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
