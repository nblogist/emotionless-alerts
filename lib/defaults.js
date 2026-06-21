// Strategy config — RELATIVE ONLY, no dollar amounts.
// The app owns all live numbers (capital, holdings, weights) per portfolio.
export const STRATEGY_CONFIG = {
  liquidBasket: {
    skimTriggerPct: 0.20,           // skim when up ≥20% from last action
    skimSizePct: 0.05,              // sell 5% of position on skim
    bigTrimTrigger: 0.20,           // monthly trim when ≥20% above target
    cashFloorPct: 0.10,             // 10% of portfolio value always stays as dry powder
    dipFromHighPct: 0.20,           // buy when price is ≥20% below recent high
    recentHighWindowDays: 30,       // trailing window for "recent high" (days)
  },
  crashBrake: {
    enabled: false,
    weeklyClosesBelow: 2,
    reRiskClosesAbove: 1,
    deRiskShiftPct: 0.50,     // shift half crypto target to gold+cash
  },
  safetyGuards: {
    fillJumpWarningPct: 0.30,         // flag when fill changes holdings or avg cost by >30%
    avgCostVsPriceWarningPct: 0.50,   // flag when avg cost is >50% off the live price
  },
  microcap: {
    maxSlippagePct: 0.015,
    volumeCapPct: 0.20,
    volumeSpikeMultiple: 2.5,
    pumpDayPct: 0.20,
    dipFromLastBuyPct: 0.15,
    cooldownHours: 12,
  },
};

export const COIN_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  AQUARI: 'aquari-2',
  XAUT: 'tether-gold',
};

// Default portfolio shape — the app fills in real numbers from its own data
export const DEFAULT_PORTFOLIO = {
  capital: 0,
  cash: 0,
  assets: [
    { symbol: 'BTC',  class: 'liquid', weight: 0.25, holdingsUsd: 0, avgCost: 0, lastActionPrice: 0 },
    { symbol: 'ETH',  class: 'liquid', weight: 0.25, holdingsUsd: 0, avgCost: 0, lastActionPrice: 0 },
    { symbol: 'SOL',  class: 'liquid', weight: 0.25, holdingsUsd: 0, avgCost: 0, lastActionPrice: 0 },
    { symbol: 'XAUT', class: 'liquid', weight: 0.25, holdingsUsd: 0, avgCost: 0, lastActionPrice: 0 },
  ],
};

// Legacy shape kept for migration — the config route falls back to this
// if no new-format config is found, so the app doesn't break during transition
export const DEFAULT_CONFIG = {
  capital: 0,
  cash: 0,
  assets: DEFAULT_PORTFOLIO.assets,
  coins: {
    BTC:    { holdingsUsd: 0, avgCost: 0, buyReference: 0 },
    ETH:    { holdingsUsd: 0, avgCost: 0, buyReference: 0 },
    SOL:    { holdingsUsd: 0, avgCost: 0, buyReference: 0 },
    AQUARI: { holdingsUsd: 0, avgCost: 0, buyReference: 0 },
    XAUT:   { holdingsUsd: 0, avgCost: 0, buyReference: 0 },
  },
};

export const DEFAULT_PORTFOLIOS = [
  {
    id: 'corolla',
    name: 'Corolla Portfolio',
    telegramChatId: '687179551',
    alertEmail: 'nblogist1@gmail.com',
    stablecoin: 'USDT',
  },
];
