import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { DEFAULT_CONFIG } from '@/lib/defaults';
import { getLivePrices, fetchWeeklyCloses } from '@/lib/prices';
import * as rules from '@/lib/rules';
import { sendTelegram } from '@/lib/telegram';
import { sendEmail } from '@/lib/email';
import { fetchMarketNews, formatNewsAlert } from '@/lib/news';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = (await store.get('config')) || DEFAULT_CONFIG;
    const prices = await getLivePrices();
    const alerts = [];
    const now = new Date();
    const isMonday = now.getUTCDay() === 1;
    const coins = Object.keys(config.coins);

    for (const coin of coins) {
      let closes = await store.get(`weeklyCloses:${coin}`);

      // Backfill weekly closes on first run
      if (!closes || !Array.isArray(closes) || closes.length === 0) {
        try {
          closes = await fetchWeeklyCloses(coin);
          await store.set(`weeklyCloses:${coin}`, closes);
          // Seed cycle high from history
          if (closes.length > 0) {
            const historicalHigh = Math.max(...closes);
            const current = (await store.get(`cycleHigh:${coin}`)) || 0;
            if (historicalHigh > current) {
              await store.set(`cycleHigh:${coin}`, historicalHigh);
            }
          }
        } catch (e) {
          console.error(`Backfill ${coin}:`, e.message);
          closes = [];
        }
      } else if (isMonday) {
        // Record new weekly close (once per Monday)
        const weekId = `${now.getUTCFullYear()}-W${now.getUTCMonth()}-${Math.floor(now.getUTCDate() / 7)}`;
        const lastWeek = await store.get(`lastWeek:${coin}`);
        if (lastWeek !== weekId && prices[coin]) {
          closes.push(prices[coin]);
          if (closes.length > 210) closes.shift();
          await store.set(`weeklyCloses:${coin}`, closes);
          await store.set(`lastWeek:${coin}`, weekId);
        }
      }

      const price = prices[coin];
      if (!price) continue;

      let alert;
      alert = await rules.checkBuyBand(coin, price, config);
      if (alert) alerts.push(alert);

      alert = await rules.checkSellTrigger(coin, price, config);
      if (alert) alerts.push(alert);

      alert = await rules.checkDrawdownZone(coin, price);
      if (alert) alerts.push(alert);

      alert = await rules.checkFloorConfirmed(coin, closes, config);
      if (alert) alerts.push(alert);
    }

    // BTC-only checks
    const btcCloses = (await store.get('weeklyCloses:BTC')) || [];
    const ma200 =
      btcCloses.length >= 200
        ? btcCloses.slice(-200).reduce((a, b) => a + b, 0) / 200
        : null;

    let alert;
    alert = await rules.checkThesisBreak(btcCloses, ma200);
    if (alert) alerts.push(alert);

    alert = await rules.checkUpsideBreak(btcCloses, config.upsideBreakUsd, config);
    if (alert) alerts.push(alert);

    alert = await rules.checkMonthly(config, prices);
    if (alert) alerts.push(alert);

    // News scanning — every cron run
    try {
      const articles = await fetchMarketNews();
      const newsAlert = formatNewsAlert(articles);
      if (newsAlert) alerts.push(newsAlert);
    } catch (e) {
      console.error('News scan error:', e.message);
    }

    // Send and log
    if (alerts.length > 0) {
      const message = alerts.join('\n\n');
      const chatIds = (config.telegramChatId || '').split(',').map(id => id.trim()).filter(Boolean);
      for (const cid of chatIds) {
        await sendTelegram(cid, message);
      }
      await sendEmail(`Emotionless Alert: ${alerts.length} rule(s) fired`, message);
      for (const a of alerts) {
        await store.lpush('alertHistory', { message: a, time: now.toISOString() });
      }
      console.log(`Sent ${alerts.length} alert(s)`);
    } else {
      console.log('No rules fired. Silence is correct.');
    }

    // Activity log — record every cron run
    const logEntry = {
      time: now.toISOString(),
      alertCount: alerts.length,
      prices: Object.fromEntries(coins.map(c => [c, prices[c] || null])),
      summary: alerts.length > 0
        ? `${alerts.length} alert(s) sent`
        : 'No rules fired — all quiet',
    };
    await store.lpush('activityLog', logEntry);

    return NextResponse.json({ ok: true, alerts: alerts.length, prices });
  } catch (err) {
    console.error('Cron error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
