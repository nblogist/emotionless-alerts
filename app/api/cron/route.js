import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { DEFAULT_CONFIG, DEFAULT_PORTFOLIOS, STRATEGY_CONFIG } from '@/lib/defaults';
import { getLivePrices, fetchWeeklyCloses } from '@/lib/prices';
import * as rules from '@/lib/rules';
import { addReason, formatSignalWithReason } from '@/lib/ai-wording';
import { checkAquariSell } from '@/lib/aquari';
import { sendTelegram } from '@/lib/telegram';
import { sendEmail } from '@/lib/email';
import { fetchAllRecentNews, fetchMarketNews, analyzeNewsWithAI, formatAINewsAlert, formatNewsAlert } from '@/lib/news';
import { migrateConfig } from '@/lib/config-migrate';

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
    const isMonthly = now.getUTCDate() === 1;
    const strat = STRATEGY_CONFIG;

    // Collect all coin symbols across all portfolios
    const allCoins = new Set();
    for (const pf of portfolios) {
      const rawCfg = (await store.get(`config:${pf.id}`)) || DEFAULT_CONFIG;
      const cfg = migrateConfig(rawCfg);
      const assets = cfg.assets || [];
      for (const a of assets) allCoins.add(a.symbol);
    }

    // ISO week number helper
    function isoWeekId(d) {
      const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
      return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    }

    // Weekly close maintenance (shared across portfolios)
    for (const coin of allCoins) {
      let closes = await store.get(`weeklyCloses:${coin}`);
      if (!closes || !Array.isArray(closes) || closes.length === 0) {
        try {
          closes = await fetchWeeklyCloses(coin);
          await store.set(`weeklyCloses:${coin}`, closes);
        } catch (e) {
          console.error(`Backfill ${coin}:`, e.message);
          closes = [];
        }
      } else if (isMonday) {
        const weekId = isoWeekId(now);
        const lastWeek = await store.get(`lastWeek:${coin}`);
        if (lastWeek !== weekId && prices[coin]) {
          closes.push(prices[coin]);
          if (closes.length > 210) closes.shift();
          await store.set(`weeklyCloses:${coin}`, closes);
          await store.set(`lastWeek:${coin}`, weekId);
        }
      }
    }

    // BTC shared data for crash brake
    const btcCloses = (await store.get('weeklyCloses:BTC')) || [];
    const ma200 =
      btcCloses.length >= 200
        ? btcCloses.slice(-200).reduce((a, b) => a + b, 0) / 200
        : null;

    // News scanning
    let newsAlert = null;
    let aiAnalysis = null;
    try {
      const allArticles = await fetchAllRecentNews();
      if (process.env.OPENROUTER_API_KEY && allArticles.length > 0) {
        aiAnalysis = await analyzeNewsWithAI(allArticles, [...allCoins]);
        if (aiAnalysis && aiAnalysis.length > 0) {
          await store.set('aiNewsAnalysis', { analysis: aiAnalysis, timestamp: now.toISOString() });
          newsAlert = formatAINewsAlert(aiAnalysis);
        }
      }
      if (!newsAlert) {
        const keywordArticles = await fetchMarketNews();
        newsAlert = formatNewsAlert(keywordArticles);
      }
    } catch (e) {
      console.error('News scan error:', e.message);
    }

    let totalAlerts = 0;

    // ── Run rules for each portfolio ──
    for (const pf of portfolios) {
      const rawConfig = (await store.get(`config:${pf.id}`)) || DEFAULT_CONFIG;
      const config = migrateConfig(rawConfig);
      const alerts = [];

      // Build portfolio context from config
      const assets = config.assets || [];
      const capital = config.capital || 0;
      const cash = config.cash || 0;

      // Compute portfolio value (sum of all asset current values + cash)
      let portfolioValue = cash;
      for (const asset of assets) {
        const p = prices[asset.symbol];
        if (p && asset.avgCost > 0) {
          asset.currentValue = (asset.holdingsUsd / asset.avgCost) * p;
        } else {
          asset.currentValue = asset.holdingsUsd || 0;
        }
        portfolioValue += asset.currentValue;
      }

      // Crash brake weight shift — if active, halve crypto targets, boost gold
      const isCrashBrakeActive = await store.get(`crashBrakeActive:${pf.id}`);
      const effectiveAssets = isCrashBrakeActive ? rules.applyCrashBrakeWeights(assets) : assets;

      const portfolio = {
        capital,
        cash,
        portfolioValue,
        assetCount: effectiveAssets.filter(a => a.class === 'liquid').length,
        assets: effectiveAssets,
      };

      // Per-asset rules (liquid basket only — AQUARI handled separately in Batch 3)
      for (const asset of effectiveAssets) {
        if (asset.class !== 'liquid') continue;
        const price = prices[asset.symbol];
        if (!price) continue;

        // Clear buy-dip alert if recovered
        await rules.clearBuyDipIfRecovered(asset, price, portfolio, pf.id);

        // 1. BUY THE DIP — continuous, any time
        const buyResult = await rules.checkBuyDip(asset, price, portfolio, pf.id, pf.name);
        if (buyResult) {
          await addReason(buyResult);
          alerts.push(formatSignalWithReason(buyResult));
        }

        // 2. SKIM ON A POP — continuous
        const skimResult = await rules.checkSkim(asset, price, pf.id, pf.name);
        if (skimResult) {
          await addReason(skimResult);
          alerts.push(formatSignalWithReason(skimResult));
        }

        // 3. BIG TRIM — monthly only
        if (isMonthly) {
          const trimResult = await rules.checkBigTrim(asset, price, portfolio, pf.id, pf.name);
          if (trimResult) {
            await addReason(trimResult);
            alerts.push(formatSignalWithReason(trimResult));
          }
        }
      }

      // Microcap rules (AQUARI — liquidity-aware sell calculator, separate sleeve)
      for (const asset of effectiveAssets) {
        if (asset.class !== 'microcap') continue;
        try {
          const mcResult = await checkAquariSell(asset, prices, pf.id, pf.name, isMonthly);
          if (mcResult) {
            await addReason(mcResult);
            alerts.push(formatSignalWithReason(mcResult));
          }
        } catch (e) {
          console.error(`Microcap ${asset.symbol}:`, e.message);
        }
      }

      // Crash brake (shared BTC signal, per-portfolio flag)
      const crashBrakeEnabled = strat.crashBrake.enabled;
      const crashResult = await rules.checkCrashBrake(btcCloses, ma200, pf.id, pf.name, crashBrakeEnabled);
      if (crashResult) {
        await addReason(crashResult);
        alerts.push(formatSignalWithReason(crashResult));
      }

      // Monthly summary
      const monthlyResult = await rules.checkMonthly(portfolio, prices, pf.id, pf.name);
      if (monthlyResult) {
        await addReason(monthlyResult);
        alerts.push(formatSignalWithReason(monthlyResult));
      }

      // News
      if (newsAlert) alerts.push(newsAlert);

      // Send alerts
      if (alerts.length > 0) {
        const message = alerts.join('\n\n');
        const chatIds = (pf.telegramChatId || '').split(',').map((id) => id.trim()).filter(Boolean);
        for (const cid of chatIds) {
          await sendTelegram(cid, message);
        }
        if (pf.alertEmail) {
          await sendEmail(`[${pf.name}] ${alerts.length} signal(s)`, message, [pf.alertEmail]);
        }
        for (const a of alerts) {
          await store.lpush('alertHistory', { message: a, time: now.toISOString(), portfolio: pf.id });
        }
        totalAlerts += alerts.length;
        console.log(`[${pf.name}] Sent ${alerts.length} signal(s)`);
      } else {
        console.log(`[${pf.name}] No signals.`);
      }
    }

    if (totalAlerts === 0) {
      console.log('No signals across all portfolios.');
    }

    // Activity log
    const logEntry = {
      time: now.toISOString(),
      alertCount: totalAlerts,
      portfolioCount: portfolios.length,
      prices: Object.fromEntries([...allCoins].map((c) => [c, prices[c] || null])),
      aiNews: aiAnalysis ? aiAnalysis.length : 0,
      summary: totalAlerts > 0
        ? `${totalAlerts} signal(s) across ${portfolios.length} portfolio(s)`
        : `All quiet across ${portfolios.length} portfolio(s)`,
    };
    await store.lpush('activityLog', logEntry);

    return NextResponse.json({ ok: true, alerts: totalAlerts, portfolios: portfolios.length, prices, aiNews: aiAnalysis?.length || 0 });
  } catch (err) {
    console.error('Cron error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
