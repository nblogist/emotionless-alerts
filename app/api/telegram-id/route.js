import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'No TELEGRAM_BOT_TOKEN set' }, { status: 500 });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
      cache: 'no-store',
    });
    const data = await res.json();

    if (!data.ok || !data.result || data.result.length === 0) {
      return NextResponse.json({
        error: 'No messages found. Make sure you sent /start to the bot on Telegram first.',
        raw: data,
      });
    }

    const chats = [];
    const seen = new Set();
    for (const update of data.result) {
      const chat = update.message?.chat;
      if (chat && !seen.has(chat.id)) {
        seen.add(chat.id);
        chats.push({
          chatId: chat.id,
          firstName: chat.first_name || '',
          lastName: chat.last_name || '',
          username: chat.username || '',
        });
      }
    }

    return NextResponse.json({ chats });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
