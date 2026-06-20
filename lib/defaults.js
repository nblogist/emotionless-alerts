export const DEFAULT_CONFIG = {
  totalCapital: 15000,
  perCoinCap: 5000,
  powderRemaining: 7500,
  reserveRemaining: 1500,
  buyBandPct: 0.07,
  rungSizes: [400, 600, 700, 800],
  sellTrimPct: 0.15,
  trimMultiples: [2.0, 3.0, 4.0],
  trailingStopPct: 0.30,
  trailingStopSellPct: 0.25,
  upsideBreakMult: 1.20,
  upsideDeployPct: 0.40,
  drawdownZones: [-0.20, -0.35, -0.50],
  coins: {
    BTC: { holdingsUsd: 2000, avgCost: 64000, buyReference: 64000 },
    ETH: { holdingsUsd: 2000, avgCost: 2600, buyReference: 2600 },
    SOL: { holdingsUsd: 2000, avgCost: 72, buyReference: 72 },
    AQUARI: { holdingsUsd: 0, avgCost: 0, buyReference: 0 },
    XAUT: { holdingsUsd: 0, avgCost: 0, buyReference: 0 },
  },
};

export const COIN_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  AQUARI: 'aquari-2',
  XAUT: 'tether-gold',
};

export const DEFAULT_PORTFOLIOS = [
  {
    id: 'corolla',
    name: 'Corolla Portfolio',
    telegramChatId: '687179551',
    alertEmail: 'nblogist1@gmail.com',
  },
];
