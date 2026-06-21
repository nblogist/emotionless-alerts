/**
 * Big-brother AI wording layer.
 * Receives ALREADY-COMPUTED signal results from deterministic code.
 * Phrases the "why" in plain language using OpenRouter.
 * NEVER computes a trade size or makes a trigger decision (I9).
 */

const TEMPLATES = {
  BUY_DIP: (s) =>
    s.buyReason === 'dip_from_high'
      ? `${s.asset} is ${pct(s.highDrop)} off its recent high — a real dip, good entry. Buying ${usd(s.buyAmountUsd)}.${s.capped ? ` (Capped — ${s.cappedReason}.)` : ''}`
      : `${s.asset} is ${pct(s.discount)} below your avg cost — a genuine dip. Buying ${usd(s.buyAmountUsd)} to lower your average.${s.capped ? ` (Capped — ${s.cappedReason}.)` : ''}`,
  SKIM: (s) =>
    `${s.asset} is up ${pct(s.gainFromAction)} since your last move and above your cost — skimming ${usd(s.skimValueUsd)} (5%), banking it, the other 95% keeps riding.`,
  BIG_TRIM: (s) =>
    `Monthly check — ${s.asset} has run ${pct(s.deviation)} above its target slice. Trimming ${usd(s.trimValueUsd)} back toward target.`,
  CRASH_BRAKE: (s) =>
    s.action === 'deRisk'
      ? `BTC closed below the 200-week moving average for 2 weeks. Shifting half of each crypto target into gold + cash until it recovers.`
      : `BTC is back above the 200-week MA. Crypto targets restored — resume normal operations.`,
  MONTHLY: () => `Monthly portfolio review — here's where everything stands.`,
  MICROCAP_SELL: (s) =>
    s.error
      ? `Can't check ${s.asset} liquidity right now — don't trade until we can verify the safe size.`
      : `${s.asset} liquidity check — safe to sell up to ${usd(s.safeSellUsd)} with ~${pct(s.actualSlippage)} slippage. ${s.limitingFactor === 'volume' ? `Capped at 20% of today's volume.` : `Pool depth limits the size to keep impact under ${pct(s.maxSlippage)}.`}`,
};

function usd(n) { return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function pct(n) { return `${(n * 100).toFixed(1)}%`; }

/**
 * Generate a plain-language reason for a signal.
 * Uses OpenRouter AI if available, falls back to templates.
 * @param {Object} signal - Pre-computed signal result from rules.js
 * @returns {string} Plain-language explanation
 */
export async function phraseSignal(signal) {
  const template = TEMPLATES[signal.type];
  const fallback = template ? template(signal) : '';

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return fallback;

  try {
    const prompt = buildPrompt(signal, fallback);
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return fallback;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || fallback;
  } catch {
    return fallback;
  }
}

function buildPrompt(signal, fallback) {
  return `You are a financial "big brother" assistant. Rephrase this trading signal explanation in 1-2 sentences of plain, friendly language. Keep the exact dollar amounts and percentages — do NOT change any numbers. Just make it sound natural and explain WHY this is a good move.

Signal: ${fallback}

Context:
- Type: ${signal.type}
- Asset: ${signal.asset || 'portfolio'}
- This is advisory only — the user places every order themselves.

Rules:
- Keep all dollar amounts and percentages exactly as given.
- Do NOT compute or suggest different amounts.
- Be concise (1-2 sentences max).
- Explain the logic, not just the action.

Plain-language version:`;
}

/**
 * Attach a plain-language reason to a signal result.
 * Mutates the signal by adding a `reason` field.
 * Returns the signal for chaining.
 */
export async function addReason(signal) {
  if (!signal) return signal;
  signal.reason = await phraseSignal(signal);
  return signal;
}

/**
 * Format a signal into a final alert message with reason + instructions.
 * Every signal shows: (1) the dollar amount, (2) a plain-language reason.
 */
export function formatSignalWithReason(signal) {
  if (!signal) return null;
  const reason = signal.reason || TEMPLATES[signal.type]?.(signal) || '';
  return reason + '\n\n' + signal.message;
}
