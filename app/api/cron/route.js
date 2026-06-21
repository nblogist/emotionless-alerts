import { NextResponse } from 'next/server';
import * as store from '@/lib/store';
import { DEFAULT_CONFIG, DEFAULT_PORTFOLIOS, STRATEGY_CONFIG } from '@/lib/defaults';
import { fetchPricesSafe, fetchWeeklyCloses, fetchHistoricalPrices } from '@/lib/prices';
import * as rules from '@/lib/rules';
import { addReason, formatSignalWithReason } from '@/lib/ai-wording';
import { checkAquariSell } from '@/lib/aquari';
import { sendTelegram } from '@/lib/telegram';
import { sendEmail } from '@/lib/email';
import { fetchAllRecentNews, fetchMarketNews, analyzeNewsWithAI, formatAINewsAlert, formatNewsAlert } from '@/lib/news';
import { migrateConfig } from '@/lib/config-migrate';
import { checkHeartbeatGap, formatPriceErrors } from '@/lib/health';
import { validateSignal, getSignalAmount } from '@/lib/validate-signal';

export const dynamic = 'force-dynamic';

// ── Send a system alert to all portfolios (for infrastructure failures) ──
async function sendSystemAlert(portfolios, message) {
  const results = [];
  for (const pf of portfolios) {
    const chatIds = (pf.telegramChatId || '').split(',').map(id => id.trim()).filter(Boolean);
    for (const cid of chatIds) {
      results.push(await sendTelegram(cid, message));
    }
    if (pf.alertEmail) {
      results.push(await sendEmail('[System] Alert', message, [pf.alertEmail]));
    }
  }
  return results;
}

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // Load portfolios early so crash handler can still notify
  let portfolios;
  try {
    portfolios = (await store.get('portfolios')) || DEFAULT_PORTFOLIOS;
  } catch {
    portfolios = DEFAULT_PORTFOLIOS;
  }

  try {
    // ── 1. Heartbeat — detect stale/missed runs ──
    const lastRun = await store.get('lastCronRun');
    const heartbeat = checkHeartbeatGap(lastRun, now);

    // ── 2. Fetch prices with validation ──
    const { prices, errors: priceErrors, fetchedAt } = await fetchPricesSafe();

    // Total price failure — bail safely, don't compute off missing data
    if (Object.keys(prices).length === 0) {
      const msg = formatPriceErrors(priceErrors) || 'Price feed down — no signals this run.';
      await sendSystemAlert(portfolios, msg);
      await store.set('lastCronRun', now.toISOString());
      await store.lpush('activityLog', {
        time: now.toISOString(),
        alertCount: 0,
        error: 'Price feed down',
        errors: priceErrors,
        summary: 'Price feed down — skipped all rules',
      });
      return NextResponse.json({ ok: false, error: 'Price feed down', errors: priceErrors });
    }

    // Partial price failure — build warning for affected assets
    const priceWarning = formatPriceErrors(priceErrors);

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

    // Fetch recent highs for dip-from-high buy path (b)
    let recentHighs = {};
    try {
      const hist = await fetchHistoricalPrices();
      recentHighs = hist.recentHighs || {};
    } catch (e) {
      console.error('Failed to fetch recent highs:', e.message);
    }

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
    const deliveryFailures = [];

    // ── Audit + validate helper ──
    // Validates signal, logs to audit, returns formatted text or null (if suppressed)
    async function processSignal(signal, price, portfolio, pfId) {
      if (!signal) return null;
      await addReason(signal);

      const check = validateSignal(signal, portfolio);
      const amount = getSignalAmount(signal);
      const auditEntry = {
        timestamp: now.toISOString(),
        portfolio: pfId,
        asset: signal.asset || null,
        action: signal.type,
        amountUsd: amount,
        priceUsed: price || signal.price || signal.spotPriceUsd || null,
        dataFreshness: `price ${Math.round((now.getTime() - new Date(fetchedAt).getTime()) / 1000)}s old`,
        reason: signal.reason || null,
        status: check.valid ? 'pending' : 'suppressed',
        suppressedReason: check.valid ? null : check.reason,
      };

      if (!check.valid) {
        auditEntry.status = 'suppressed';
        console.error(`[SUPPRESSED] ${signal.type} ${signal.asset}: ${check.reason}`);
        await store.lpush('auditLog', auditEntry);
        // Notify about the suppressed signal
        return `SIGNAL SUPPRESSED: ${check.reason}. Signal blocked — needs attention.`;
      }

      await store.lpush('auditLog', auditEntry);
      return formatSignalWithReason(signal);
    }

    // ── Run rules for each portfolio ──
    for (const pf of portfolios) {
      const rawConfig = (await store.get(`config:${pf.id}`)) || DEFAULT_CONFIG;
      const config = migrateConfig(rawConfig);
      const alerts = [];

      // Warnings go first so they're always visible
      if (heartbeat.stale) alerts.push(heartbeat.message);
      if (priceWarning) alerts.push(priceWarning);

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

      // Per-asset rules (liquid basket only — AQUARI handled separately)
      for (const asset of effectiveAssets) {
        if (asset.class !== 'liquid') continue;
        const price = prices[asset.symbol];
        if (!price) continue;  // Skip assets with no valid price — never compute off garbage

        // Clear buy-dip alert if recovered
        const rh = recentHighs[asset.symbol] || 0;
        await rules.clearBuyDipIfRecovered(asset, price, portfolio, pf.id, rh);

        // 1. BUY THE DIP
        const buyText = await processSignal(
          await rules.checkBuyDip(asset, price, portfolio, pf.id, pf.name, rh),
          price, portfolio, pf.id,
        );
        if (buyText) alerts.push(buyText);

        // 2. SKIM ON A POP
        const skimText = await processSignal(
          await rules.checkSkim(asset, price, pf.id, pf.name),
          price, portfolio, pf.id,
        );
        if (skimText) alerts.push(skimText);

        // 3. BIG TRIM — monthly only
        if (isMonthly) {
          const trimText = await processSignal(
            await rules.checkBigTrim(asset, price, portfolio, pf.id, pf.name),
            price, portfolio, pf.id,
          );
          if (trimText) alerts.push(trimText);
        }
      }

      // Microcap rules (AQUARI — liquidity-aware sell calculator)
      for (const asset of effectiveAssets) {
        if (asset.class !== 'microcap') continue;
        try {
          const mcText = await processSignal(
            await checkAquariSell(asset, prices, pf.id, pf.name, isMonthly),
            prices[asset.symbol], portfolio, pf.id,
          );
          if (mcText) alerts.push(mcText);
        } catch (e) {
          console.error(`Microcap ${asset.symbol}:`, e.message);
          alerts.push(`${asset.symbol} liquidity check failed: ${e.message}. Don't trade until next successful check.`);
        }
      }

      // Crash brake (no dollar amount — skips validation)
      const crashBrakeEnabled = strat.crashBrake.enabled;
      const crashText = await processSignal(
        await rules.checkCrashBrake(btcCloses, ma200, pf.id, pf.name, crashBrakeEnabled),
        null, portfolio, pf.id,
      );
      if (crashText) alerts.push(crashText);

      // Monthly summary (no dollar amount — skips validation)
      const monthlyText = await processSignal(
        await rules.checkMonthly(portfolio, prices, pf.id, pf.name),
        null, portfolio, pf.id,
      );
      if (monthlyText) alerts.push(monthlyText);

      // News
      if (newsAlert) alerts.push(newsAlert);

      // ── Send alerts with delivery tracking ──
      if (alerts.length > 0) {
        const message = alerts.join('\n\n');
        const chatIds = (pf.telegramChatId || '').split(',').map((id) => id.trim()).filter(Boolean);
        for (const cid of chatIds) {
          const r = await sendTelegram(cid, message);
          if (!r.ok) {
            deliveryFailures.push({ portfolio: pf.id, channel: 'telegram', chatId: cid, error: r.error });
          }
        }
        if (pf.alertEmail) {
          const r = await sendEmail(`[${pf.name}] ${alerts.length} signal(s)`, message, [pf.alertEmail]);
          if (!r.ok) {
            deliveryFailures.push({ portfolio: pf.id, channel: 'email', error: r.error });
          }
        }
        // Update audit entries with delivery status
        const auditEntries = await store.lrange('auditLog', 0, alerts.length - 1);
        for (const entry of auditEntries) {
          if (entry.status === 'pending') entry.status = 'sent';
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

    // Log delivery failures for visibility
    if (deliveryFailures.length > 0) {
      console.error('Delivery failures:', JSON.stringify(deliveryFailures));
      await store.lpush('deliveryFailures', {
        time: now.toISOString(),
        failures: deliveryFailures,
      });
    }

    if (totalAlerts === 0) {
      console.log('No signals across all portfolios.');
    }

    // ── Heartbeat stamp ──
    await store.set('lastCronRun', now.toISOString());
    await store.set('pricesFetchedAt', fetchedAt);

    // Activity log
    const logEntry = {
      time: now.toISOString(),
      alertCount: totalAlerts,
      portfolioCount: portfolios.length,
      prices: Object.fromEntries([...allCoins].map((c) => [c, prices[c] || null])),
      priceErrors: priceErrors.length > 0 ? priceErrors : undefined,
      deliveryFailures: deliveryFailures.length > 0 ? deliveryFailures : undefined,
      aiNews: aiAnalysis ? aiAnalysis.length : 0,
      summary: totalAlerts > 0
        ? `${totalAlerts} signal(s) across ${portfolios.length} portfolio(s)`
        : `All quiet across ${portfolios.length} portfolio(s)`,
    };
    await store.lpush('activityLog', logEntry);

    return NextResponse.json({
      ok: true,
      alerts: totalAlerts,
      portfolios: portfolios.length,
      prices,
      priceErrors: priceErrors.length > 0 ? priceErrors : undefined,
      deliveryFailures: deliveryFailures.length > 0 ? deliveryFailures : undefined,
      aiNews: aiAnalysis?.length || 0,
    });
  } catch (err) {
    console.error('Cron error:', err);
    // Try to notify about the crash — don't let this throw
    try {
      await sendSystemAlert(portfolios, [
        `CRON ERROR — system needs attention`,
        ``,
        `The hourly check crashed: ${err.message}`,
        `No signals were processed this run.`,
        `This is not normal — check Vercel logs for details.`,
      ].join('\n'));
    } catch (notifyErr) {
      console.error('Failed to send crash notification:', notifyErr.message);
    }
    // Still stamp heartbeat so we know the cron at least tried
    try { await store.set('lastCronRun', now.toISOString()); } catch {}
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
