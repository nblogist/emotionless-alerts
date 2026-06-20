# GOAL TRACKER — do not drift from this

## What the user wants (THE GOAL)
Grow ANY portfolio by doing all of these at once — no choking any of them:
1. LIMIT DOWNSIDE — protect capital in crashes.
2. LOWER AVG BUY COST — buy dips so cost basis drops.
3. KEEP UPSIDE — do NOT choke winners (the old +40% / 2x debate cut gains).
4. STACK CASH **AND** REINVEST — bank some profit, recycle some back in to COMPOUND.
   >> This is the key shift: old rules harvested to dead USDT. New rules must reinvest to snowball.

## Portfolios in scope (ONLY these)
BTC, ETH, SOL, AQUARI (illiquid microcap), XAUT (tokenized gold).

## Rules must be
- GENERAL + RELATIVE (percentages, any size, multi-portfolio). No absolute $ anywhere.
- App owns all live holdings/capital. Files = rules only.
- Advisory (app signals, user trades).

## Hard-won lessons already proven (DON'T re-litigate)
- 25% all-or-nothing trailing stop = BAD (sold winners at bottoms). Killed it.
- Selling early/eager on the way up = LOWERS returns (proven twice: +40% trims, +15% skim both dragged returns vs letting it ride). Lower DD but lower return.
- Quarter-out trailing (sell 25% on a pullback, let rest ride) = good middle ground.
- 4 escalating dip rungs beat 6. Dip ladder + cash buffer + BTC 200wMA circuit breaker = the real protection.
- AQUARI = liquidity-bound, hand-played clips, not a ladder.

## Status
- App EDITS FROZEN by user until we nail the general rules.
- Current task: research real quant strategies for this goal, design, BACKTEST, then lock.

## Decisions still open (confirm with user, don't assume)
- Exact reinvest split (how much banked vs recycled).
- Whether XAUT (gold) uses same engine or a calmer one (gold ≠ crypto vol).

## STRATEGY FOUND (tested, promising) — "Rebalanced Vol-Harvest + Gold Ballast"
Engine: hold target weights across BTC/ETH/SOL + XAUT(gold) + cash. Rebalance monthly:
trim what ran up (sell high → banks cash), buy what lagged (buy low → lowers avg cost).
Rebalancing IS the reinvest/compounding engine. Gold = uncorrelated ballast that funds
crypto dip-buying in crashes. Optional BTC-200wMA breaker de-risks in structural bears.
AQUARI stays a SEPARATE hand-played sleeve (illiquid, can't mechanically rebalance).

### Backtest — rolling 2yr windows (median, the typical outcome)
| Version | Return | Max DD |
|---|---|---|
| HODL BTC/ETH/SOL | +101% | -55% |
| Rebal crypto75 / gold25  (GROWTH) | +131% | -43% |
| Rebal crypto60 / gold25 / cash15 (BALANCED) | +109% | -35% |
| Rebal + breaker (SAFEST) | +95% | -33% |
>> GROWTH version beats HODL on BOTH return and drawdown. Hits all 4 goals.

### OPEN: user to pick risk dial (Growth / Balanced / Safest). Then tune bands + lock files.
### Caveats: monthly gold interpolated; n≈1 cycle; tune rebalance band next.

## LOCKED: Growth dial, tuned
- Liquid basket = equal 25% BTC / ETH / SOL / XAUT(gold), rebalance MONTHLY when an asset drifts >15% from target.
- Result: +132% median / -41% DD / beats HODL 71% of windows. Dip-cash booster dropped (hurt).
- AQUARI: separate liquidity-aware SELL calculator — free data (DexScreener/GeckoTerminal + on-chain pool reserves via Base RPC, constant-product slippage). Paid quote API optional; app asks user only if it wants it.
- Big-brother layer: every signal explains WHY in plain words (use OpenRouter AI). Fold existing AI news-scan into heads-ups.
- App frozen until files handed over. Files = rules only; app owns holdings/weights/capital.

## UPGRADE: asymmetric "buy fast, sell slow" (tested, beats monthly)
- BUY THE DIP fast: any asset >10% below target → buy back, ANY time, as often as it happens (opportunistic).
- TRIM winners slow: only >20% above target, monthly cadence (don't choke runners).
- Result: +138% median / -44% DD vs monthly +132% and HODL +101%. ~25 trades/yr (~2/mo).
- Lesson reconfirmed: acting fast on BUYS helps; acting fast on SELLS hurts (chokes winners). 

## ADDED: small skim on pumps (user's call, data-backed)
- Skim 5% of position whenever a coin is +40% from last action & above cost. Books ~$4,800 cash/2yr.
- Cost: +134% vs +138% (4pts = noise). DD unchanged -44%.
- Rationale: realized gains + a rule the user actually believes in/will follow > theoretical max.
- Lesson refined: small skim on BIG pump = cheap & fine. Big skim on small pump = kills returns (avoid).

## TUNED TO 1-YEAR HORIZON + skim locked at 5%/+20%
- User horizon ~1 year. Re-tested on 1-yr rolling windows (53 samples).
- Skim: 5% per +20% leg (user's call over my +40%). Banks ~$2k/yr cash.
- 1-yr results: typical +28% vs HODL +14%; 68% of years positive; 64% beat HODL; med DD -37% vs -47%.
- Tradeoff accepted: give up the rare monster-bull year for better typical-year odds + cash along the way.

## 10% CASH-FLOOR RULE (added during build)
- Dip-buy never reduces cash below 10% of the portfolio's current value.
- Only cash above that floor is spendable. If a buy is capped, the signal shows the ideal gap and explains the cap.
- Rationale: keeps dry powder for the next dip — tested, general rule. Prevents going all-in on one crash.
- Added to RULES.md (BUY logic + I1 invariant), strategy_config.json (cashFloorPct: 0.10), and automated tests.

## MONEY-MATH SAFETY GUARDS (Batch 6 — last build batch)
- Signal sanity-check: every signal's dollar amount validated before send — NaN/negative/Infinity/exceeds-cash/exceeds-holdings/exceeds-portfolio all blocked, logged, and surfaced.
- Audit log: every signal (sent or suppressed) durably logged to Redis with full metadata — queryable via /api/audit.
- Fill-confirmation echo: settings saves show per-field diff + confirmation modal. Large jumps (>30% holdings/avgCost change) and avg cost >50% off live price flagged with warnings.
- Thresholds config-driven (STRATEGY_CONFIG.safetyGuards), not hardcoded.
- Invariants added: I12 (signal validation gate), I13 (audit logging), I14 (fill confirmation).
- Added to RULES.md (§F-extra Safety Guards + I12-I14), strategy_config.json (safetyGuards section), and automated tests.
