/**
 * Migrate old v4 config shape to the new relative-basket shape.
 * Old: { totalCapital, perCoinCap, powderRemaining, coins: { BTC: { holdingsUsd, avgCost, buyReference } } }
 * New: { capital, cash, assets: [{ symbol, class, weight, holdingsUsd, avgCost, lastActionPrice }] }
 */
export function migrateConfig(raw) {
  if (!raw) return raw;

  // Already new format
  if (raw.assets && Array.isArray(raw.assets)) return raw;

  // Old format with coins object — migrate
  if (raw.coins && typeof raw.coins === 'object') {
    const entries = Object.entries(raw.coins);
    const liquidCount = entries.filter(([sym]) => sym !== 'AQUARI').length;
    const assets = entries.map(([symbol, cc]) => ({
      symbol,
      class: symbol === 'AQUARI' ? 'microcap' : 'liquid',
      weight: symbol === 'AQUARI' ? 0 : (liquidCount > 0 ? 1 / liquidCount : 0.25),
      holdingsUsd: cc.holdingsUsd || 0,
      avgCost: cc.avgCost || 0,
      lastActionPrice: cc.buyReference || cc.avgCost || 0,
    }));

    return {
      capital: raw.totalCapital || 0,
      cash: raw.powderRemaining || 0,
      assets,
    };
  }

  return raw;
}
