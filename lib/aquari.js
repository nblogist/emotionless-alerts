/**
 * AQUARI (microcap) liquidity-aware sell calculator.
 * Separate sleeve — never touches basket rebalance math.
 *
 * Data sources (all free):
 *   - On-chain: Uniswap v2 getReserves() via Base RPC
 *   - Off-chain: DexScreener API for volume + price data
 *
 * Math: constant-product (x·y = k) to find max sell keeping
 * price impact ≤ ~1.5%, capped at 20% of 24h volume.
 */

import * as store from './store.js';
import { STRATEGY_CONFIG } from './defaults.js';

const PAIR_ADDRESS = '0x30Ec7B2f5be26d03D20AC86554dAadD2b738CA0F';
const AQUARI_TOKEN = '0x7F0E9971D3320521Fc88F863E173a4cddBB051bA';
// WETH on Base = 0x4200000000000000000000000000000000000006
// 0x42... < 0x7F... → WETH is token0, AQUARI is token1
const WETH_IS_TOKEN0 = true;

function getRpcUrl() {
  return process.env.BASE_RPC_URL || 'https://mainnet.base.org';
}

// ── Data fetching ──────────────────────────────────────────────

export async function fetchPoolReserves() {
  const res = await fetch(getRpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: PAIR_ADDRESS, data: '0x0902f1ac' }, 'latest'],
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Base RPC HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  if (!data.result || data.result === '0x' || data.result.length < 130) {
    throw new Error('Empty or invalid reserves response');
  }

  const hex = data.result.slice(2);
  const r0 = BigInt('0x' + hex.slice(0, 64));
  const r1 = BigInt('0x' + hex.slice(64, 128));

  return {
    wethReserve: WETH_IS_TOKEN0 ? r0 : r1,
    aquariReserve: WETH_IS_TOKEN0 ? r1 : r0,
  };
}

export async function fetchDexScreenerData() {
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${AQUARI_TOKEN}`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
  const data = await res.json();

  const pair = data.pairs?.find(
    (p) => p.pairAddress?.toLowerCase() === PAIR_ADDRESS.toLowerCase(),
  );
  if (!pair) throw new Error('AQUARI/WETH pair not found on DexScreener');

  return {
    volume24h: pair.volume?.h24 || 0,
    priceChange24h: pair.priceChange?.h24 || 0,
    priceUsd: parseFloat(pair.priceUsd) || 0,
    liquidityUsd: pair.liquidity?.usd || 0,
  };
}

// ── Pure math — no side effects, fully testable ───────────────

/**
 * Compute the maximum safe sell size for a microcap token.
 *
 * @param {Object} p
 * @param {bigint} p.aquariReserve  - Raw AQUARI pool reserve (18 decimals)
 * @param {bigint} p.wethReserve    - Raw WETH pool reserve (18 decimals)
 * @param {number} p.volume24hUsd   - 24h trading volume in USD
 * @param {number} p.ethPriceUsd    - Current ETH price in USD
 * @param {number} [p.maxSlippagePct=0.015]
 * @param {number} [p.volumeCapPct=0.20]
 */
export function computeSafeSellSize({
  aquariReserve,
  wethReserve,
  volume24hUsd,
  ethPriceUsd,
  maxSlippagePct = 0.015,
  volumeCapPct = 0.20,
}) {
  // Human-readable units (both tokens 18 decimals)
  const aqR = Number(aquariReserve) / 1e18;
  const wR = Number(wethReserve) / 1e18;

  const spotPriceWeth = wR / aqR;
  const spotPriceUsd = spotPriceWeth * ethPriceUsd;
  const depthUsd = wR * ethPriceUsd * 2; // both sides of 50/50 pool

  // ── Slippage limit ──
  // Price impact of selling Δ tokens: impact = Δ / (reserve + Δ)
  // Solving: Δ = impact × reserve / (1 − impact)
  const maxSellTokens = (maxSlippagePct * aqR) / (1 - maxSlippagePct);

  // WETH received with 0.3% Uniswap fee
  const wethOut =
    (wR * maxSellTokens * 997) / (aqR * 1000 + maxSellTokens * 997);
  const slippageLimitUsd = wethOut * ethPriceUsd;

  // ── Volume cap ──
  const volumeCapUsd = volume24hUsd * volumeCapPct;

  // ── Safe sell = smaller of the two ──
  const safeSellUsd = Math.min(slippageLimitUsd, volumeCapUsd);
  const limitingFactor =
    slippageLimitUsd <= volumeCapUsd ? 'slippage' : 'volume';

  // Tokens at safe sell
  const safeSellTokens = spotPriceUsd > 0 ? safeSellUsd / spotPriceUsd : 0;
  const actualSlippage =
    safeSellTokens > 0 ? safeSellTokens / (aqR + safeSellTokens) : 0;

  return {
    safeSellTokens,
    safeSellUsd,
    slippageLimitUsd,
    volumeCapUsd,
    limitingFactor,
    actualSlippage,
    maxSlippagePct,
    spotPriceUsd,
    depthUsd,
    volume24hUsd,
  };
}

// ── Formatting helpers ────────────────────────────────────────

function fU(n) {
  const v = Number(n);
  if (v < 0.01) return `$${v.toFixed(6)}`;
  if (v < 1) return `$${v.toFixed(4)}`;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fP(n) { return (n * 100).toFixed(2) + '%'; }
function fN(n) {
  const v = Number(n);
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(6);
}

// ── Main orchestrator ─────────────────────────────────────────

export async function checkAquariSell(asset, prices, pid, pName, isMonthly = false) {
  const strat = STRATEGY_CONFIG.microcap;
  if (!asset.holdingsUsd || asset.holdingsUsd === 0) return null;

  // Cooldown
  const cdKey = `${pid}:aquariCooldown:${asset.symbol}`;
  const lastAlert = await store.get(cdKey);
  if (lastAlert) {
    const elapsed = Date.now() - new Date(lastAlert).getTime();
    if (elapsed < strat.cooldownHours * 3600 * 1000) return null;
  }

  // ── Fetch live data — fail explicitly ──
  let poolData, dexData;
  try {
    poolData = await fetchPoolReserves();
  } catch (e) {
    return {
      type: 'MICROCAP_SELL', asset: asset.symbol, error: true, safeSellUsd: 0,
      message: `[${pName}] ${asset.symbol} LIQUIDITY CHECK FAILED\n\nCould not read pool reserves: ${e.message}\nDon't trade — can't verify safe size right now.`,
    };
  }

  try {
    dexData = await fetchDexScreenerData();
  } catch (e) {
    return {
      type: 'MICROCAP_SELL', asset: asset.symbol, error: true, safeSellUsd: 0,
      message: `[${pName}] ${asset.symbol} LIQUIDITY CHECK FAILED\n\nCould not read volume data: ${e.message}\nDon't trade — can't verify safe size right now.`,
    };
  }

  // ── Dead volume / thin pool → skip entirely ──
  if (dexData.volume24h < 100 || dexData.liquidityUsd < 500) {
    return null;
  }

  const ethPrice = prices?.ETH || 0;
  if (!ethPrice) {
    return {
      type: 'MICROCAP_SELL', asset: asset.symbol, error: true, safeSellUsd: 0,
      message: `[${pName}] ${asset.symbol} LIQUIDITY CHECK FAILED\n\nNo ETH price available.\nDon't trade — can't compute USD values.`,
    };
  }

  // ── Trigger check — fire on pump day or monthly ──
  const pumpTriggered =
    Math.abs(dexData.priceChange24h) >= strat.pumpDayPct * 100;
  if (!pumpTriggered && !isMonthly) return null;

  // ── Compute safe sell ──
  const result = computeSafeSellSize({
    aquariReserve: poolData.aquariReserve,
    wethReserve: poolData.wethReserve,
    volume24hUsd: dexData.volume24h,
    ethPriceUsd: ethPrice,
    maxSlippagePct: strat.maxSlippagePct,
    volumeCapPct: strat.volumeCapPct,
  });

  await store.set(cdKey, new Date().toISOString());

  const principalPct =
    asset.holdingsUsd > 0
      ? (result.safeSellUsd / asset.holdingsUsd) * 100
      : 0;

  const triggerReason = pumpTriggered
    ? `Price moved ${dexData.priceChange24h > 0 ? '+' : ''}${Number(dexData.priceChange24h).toFixed(1)}% in 24h`
    : 'Monthly review';

  return {
    type: 'MICROCAP_SELL',
    asset: asset.symbol,
    error: false,
    safeSellUsd: result.safeSellUsd,
    safeSellTokens: result.safeSellTokens,
    actualSlippage: result.actualSlippage,
    maxSlippage: result.maxSlippagePct,
    volume24h: result.volume24hUsd,
    depthUsd: result.depthUsd,
    limitingFactor: result.limitingFactor,
    principalPct,
    spotPriceUsd: result.spotPriceUsd,
    triggerReason,
    message: [
      `[${pName}] ${asset.symbol} SELL CALCULATOR — safe to sell up to ${fU(result.safeSellUsd)}`,
      ``,
      `Trigger: ${triggerReason}`,
      ``,
      `Pool depth: ${fU(result.depthUsd)}`,
      `24h volume: ${fU(result.volume24hUsd)}`,
      `${asset.symbol} price: ${fU(result.spotPriceUsd)}`,
      ``,
      `Safe sell: ${fU(result.safeSellUsd)} (${fN(result.safeSellTokens)} ${asset.symbol})`,
      `  Slippage at this size: ${fP(result.actualSlippage)}`,
      `  Limiting factor: ${result.limitingFactor === 'slippage' ? `pool depth (${fP(result.maxSlippagePct)} max impact)` : `volume cap (20% of ${fU(result.volume24hUsd)})`}`,
      `  Principal recovered: ${principalPct.toFixed(1)}% of your ${fU(asset.holdingsUsd)} cost basis`,
    ].join('\n'),
  };
}
