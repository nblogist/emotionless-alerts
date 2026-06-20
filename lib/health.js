/**
 * Health check utilities — pure functions, no side effects.
 */

/**
 * Detect stale/missed cron runs.
 * @param {string|null} lastRunISO - ISO timestamp of last run, or null if never run
 * @param {Date} [now] - Current time (injectable for testing)
 * @returns {{ stale: boolean, hours: number|null, message: string|null }}
 */
export function checkHeartbeatGap(lastRunISO, now = new Date()) {
  if (!lastRunISO) {
    return { stale: false, hours: null, message: null };
  }
  const gapMs = now.getTime() - new Date(lastRunISO).getTime();
  const hours = Math.round(gapMs / (3600 * 1000) * 10) / 10;
  if (hours > 24) {
    return {
      stale: true,
      hours,
      message: `STALE RUN WARNING: Last cron run was ${Math.round(hours)} hours ago. Data may be outdated — check if cron is configured correctly.`,
    };
  }
  return { stale: false, hours, message: null };
}

/**
 * Format price errors into a plain-language notification.
 * @param {Array<{type:string, message:string, symbol?:string}>} errors
 * @returns {string|null}
 */
export function formatPriceErrors(errors) {
  if (!errors || errors.length === 0) return null;

  const feedDown = errors.find(e => e.type === 'PRICE_FEED_DOWN');
  if (feedDown) {
    return [
      `PRICE FEED DOWN — no signals this run`,
      ``,
      `Couldn't get prices from CoinGecko: ${feedDown.message}`,
      ``,
      `No trades suggested — can't compute anything off missing data.`,
      `Next run will try again automatically.`,
    ].join('\n');
  }

  const invalid = errors.filter(e => e.type === 'PRICE_INVALID');
  if (invalid.length > 0) {
    return `Missing prices for ${invalid.map(e => e.symbol).join(', ')} — those assets were skipped this run.`;
  }

  return null;
}
