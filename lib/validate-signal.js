/**
 * Signal sanity-check — the last gate before a signal reaches the user.
 * Every check fails safe: block the signal, never send a bad number.
 * Pure function — no side effects, fully testable.
 */

/**
 * Validate a signal's dollar amount against portfolio constraints.
 * @param {Object} signal - Pre-computed signal from rules engine
 * @param {Object} portfolio - Portfolio context { capital, cash, portfolioValue, assets }
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateSignal(signal, portfolio) {
  if (!signal) return { valid: true };

  // Types without dollar amounts — always pass
  if (signal.type === 'CRASH_BRAKE' || signal.type === 'MONTHLY') {
    return { valid: true };
  }

  // Extract the relevant dollar amount
  const amount = getSignalAmount(signal);

  // 1. Must be a finite, non-negative number
  if (amount === null || amount === undefined || !isFinite(amount) || amount < 0) {
    return {
      valid: false,
      reason: `computed an impossible value for ${signal.asset} (${amount}) — not a valid dollar amount`,
    };
  }

  // Zero-amount signals are OK (e.g. capped buy at floor) — pass through
  if (amount === 0) return { valid: true };

  // 2. No single signal may exceed portfolio's total value
  if (portfolio.portfolioValue > 0 && amount > portfolio.portfolioValue) {
    return {
      valid: false,
      reason: `${signal.type} for ${signal.asset}: $${fmt(amount)} exceeds total portfolio value ($${fmt(portfolio.portfolioValue)})`,
    };
  }

  // 3. BUY must not exceed spendable cash
  if (signal.type === 'BUY_DIP' && signal.buyAmountUsd > 0) {
    const floor = portfolio.portfolioValue * 0.10;
    const spendable = Math.max(0, portfolio.cash - floor);
    // Allow 1% tolerance for floating-point rounding
    if (signal.buyAmountUsd > spendable * 1.01 + 0.01) {
      return {
        valid: false,
        reason: `BUY for ${signal.asset}: $${fmt(signal.buyAmountUsd)} exceeds spendable cash ($${fmt(spendable)})`,
      };
    }
  }

  // 4. SELL/SKIM/TRIM must not exceed current holdings value
  if (signal.type === 'SKIM' || signal.type === 'BIG_TRIM') {
    const sellValue = signal.skimValueUsd || signal.trimValueUsd || 0;
    const asset = portfolio.assets?.find(a => a.symbol === signal.asset);
    const currentValue = asset?.currentValue || 0;
    if (currentValue > 0 && sellValue > currentValue * 1.01 + 0.01) {
      return {
        valid: false,
        reason: `${signal.type} for ${signal.asset}: sell $${fmt(sellValue)} exceeds holdings ($${fmt(currentValue)})`,
      };
    }
  }

  // 5. MICROCAP_SELL — error signals always pass (they say "don't trade")
  if (signal.type === 'MICROCAP_SELL' && signal.error) {
    return { valid: true };
  }

  return { valid: true };
}

/**
 * Extract the primary dollar amount from a signal.
 */
export function getSignalAmount(signal) {
  switch (signal.type) {
    case 'BUY_DIP': return signal.buyAmountUsd;
    case 'SKIM': return signal.skimValueUsd;
    case 'BIG_TRIM': return signal.trimValueUsd;
    case 'MICROCAP_SELL': return signal.safeSellUsd;
    default: return null;
  }
}

function fmt(n) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
