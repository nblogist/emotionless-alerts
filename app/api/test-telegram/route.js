import { NextResponse } from 'next/server';
import { sendTelegram } from '@/lib/telegram';
import * as store from '@/lib/store';
import { DEFAULT_CONFIG } from '@/lib/defaults';

export async function POST() {
  try {
    const config = (await store.get('config')) || DEFAULT_CONFIG;
    if (!config.telegramChatId) {
      return NextResponse.json({ ok: false, error: 'No chat ID configured in settings' });
    }
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN env var not set' });
    }
    const chatIds = config.telegramChatId.split(',').map(id => id.trim()).filter(Boolean);
    for (const cid of chatIds) {
      await sendTelegram(cid, 'Emotionless Alerts test message. Bot is connected and working.');
    }
    return NextResponse.json({ ok: true, sentTo: chatIds.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
