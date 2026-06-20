export async function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('[TELEGRAM] No token configured.');
    return { ok: false, error: 'No TELEGRAM_BOT_TOKEN configured' };
  }

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return { ok: true };
      const body = await res.text();
      lastError = `HTTP ${res.status}: ${body}`;
      console.error(`[TELEGRAM] Attempt ${attempt} failed: ${lastError}`);
    } catch (e) {
      lastError = e.message;
      console.error(`[TELEGRAM] Attempt ${attempt} error: ${lastError}`);
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
  return { ok: false, error: `Failed after 2 attempts: ${lastError}` };
}
