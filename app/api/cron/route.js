import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { DEFAULT_CONFIG, DEFAULT_PORTFOLIOS } from '@/lib/defaults';
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
    const portfolios = (await store.get('portfolios')) || DEFAULT_PORTFOLIOS;
    const prices = await getLivePrices();
    const now = new Date();
    const isMonday = now.getUTCDay() === 1;

    // Collect all coin symbols across all portfolios
    const allCoins = new Set();
    for (const pf of portfolios) {
      const config = (await store.get(`config:${pf.id}`)) || DEFAULT_CONFIG;
      Object.keys(config.coins).forEach((c) => allCoins.add(c));
    }

    // Shared market data: weekly closes + cycle highs (same for all portfolios)
    for (const coin of allCoins) {
      let closes = await store.get(`weeklyCloses:${coin}`);

      if (!closes || !Array.isArray(closes) || closes.length === 0) {
        try {
          closes = await fetchWeeklyCloses(coin);
          await store.set(`weeklyCloses:${coin}`, closes);
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
        const weekId = `${now.getUTCFullYear()}-W${now.getUTCMonth()}-${Math.floor(now.getUTCDate() / 7)}`;
        const lastWeek = await store.get(`lastWeek:${coin}`);
        if (lastWeek !== weekId && prices[coin]) {
          closes.push(prices[coin]);
          if (closes.length > 210) closes.shift();
          await store.set(`weeklyCloses:${coin}`, closes);
          await store.set(`lastWeek:${coin}`, weekId);
        }
      }
    }

    // BTC shared data
    const btcCloses = (await store.get('weeklyCloses:BTC')) || [];
    const ma200 =
      btcCloses.length >= 200
        ? btcCloses.slice(-200).reduce((a, b) => a + b, 0) / 200
        : null;

    // News scanning — shared across portfolios
    let newsAlert = null;
    try {
      const articles = await fetchMarketNews();
      newsAlert = formatNewsAlert(articles);
    } catch (e) {
      console.error('News scan error:', e.message);
    }

    let totalAlerts = 0;

    // Run rules for each portfolio
    for (const pf of portfolios) {
      const config = (await store.get(`config:${pf.id}`)) || DEFAULT_CONFIG;
      const coins = Object.keys(config.coins);
      const alerts = [];

      for (const coin of coins) {
        const price = prices[coin];
        if (!price) continue;

        let alert;
        alert = await rules.checkBuyBand(coin, price, config, pf.id, pf.name);
        if (alert) alerts.push(alert);

        alert = await rules.checkSellTrigger(coin, price, config, pf.id, pf.name);
        if (alert) alerts.push(alert);

        alert = await rules.checkDrawdownZone(coin, price, pf.id, pf.name);
        if (alert) alerts.push(alert);

        const closes = (await store.get(`weeklyCloses:${coin}`)) || [];
        alert = await rules.checkFloorConfirmed(coin, closes, config, pf.id, pf.name);
        if (alert) alerts.push(alert);
      }

      // BTC-only checks (per portfolio — different thresholds/cash amounts)
      let alert;
      alert = await rules.checkThesisBreak(btcCloses, ma200, pf.id, pf.name);
      if (alert) alerts.push(alert);

      alert = await rules.checkUpsideBreak(btcCloses, config.upsideBreakUsd, config, pf.id, pf.name);
      if (alert) alerts.push(alert);

      alert = await rules.checkMonthly(config, prices, pf.id, pf.name);
      if (alert) alerts.push(alert);

      // Add news to each portfolio's alerts
      if (newsAlert) alerts.push(newsAlert);

      // Send alerts to this portfolio's channels
      if (alerts.length > 0) {
        const message = alerts.join('\n\n');

        // Telegram — send to this portfolio's chat ID
        const chatIds = (pf.telegramChatId || '').split(',').map((id) => id.trim()).filter(Boolean);
        for (const cid of chatIds) {
          await sendTelegram(cid, message);
        }

        // Email — send to this portfolio's email
        if (pf.alertEmail) {
          await sendEmail(
            `[${pf.name}] ${alerts.length} rule(s) fired`,
            message,
            [pf.alertEmail]
          );
        }

        for (const a of alerts) {
          await store.lpush('alertHistory', { message: a, time: now.toISOString(), portfolio: pf.id });
        }

        totalAlerts += alerts.length;
        console.log(`[${pf.name}] Sent ${alerts.length} alert(s)`);
      } else {
        console.log(`[${pf.name}] No rules fired.`);
      }
    }

    if (totalAlerts === 0) {
      console.log('No rules fired across all portfolios. Silence is correct.');
    }

    // Activity log
    const logEntry = {
      time: now.toISOString(),
      alertCount: totalAlerts,
      portfolioCount: portfolios.length,
      prices: Object.fromEntries([...allCoins].map((c) => [c, prices[c] || null])),
      summary: totalAlerts > 0
        ? `${totalAlerts} alert(s) across ${portfolios.length} portfolio(s)`
        : `All quiet across ${portfolios.length} portfolio(s)`,
    };
    await store.lpush('activityLog', logEntry);

    return NextResponse.json({ ok: true, alerts: totalAlerts, portfolios: portfolios.length, prices });
  } catch (err) {
    console.error('Cron error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
