# RULES — Rebalanced Vol-Harvest + Gold Ballast (general, relative, ~1-yr horizon)

> The app is a **big brother**: it does the math, suggests the move, and explains WHY in plain
> words so you act on logic, not emotion. **Advisory** — it signals, you place every order.
> **Everything relative** — weights and triggers are percentages; the app owns all live holdings,
> capital and weights per portfolio and computes the dollar amounts. Files = rules only.
> **AI (OpenRouter) explains and warns; deterministic code calculates and decides — never the reverse.**
> Goal: grow, lower average cost, limit downside, book some cash along the way. Not financial advice.

---

## The idea in one line
Hold a balanced basket. **Buy every dip fast** (lowers your cost), **let winners run** while
**skimming a little profit** on real pops, and **trim big only occasionally**. Gold sits in the
basket as ballast — it holds up when crypto bleeds, so your safe money funds the dip-buying.

## A · LIQUID BASKET (BTC / ETH / SOL / XAUT) — buy fast, sell slow
**Target weights:** equal — 25% each (general: 1/N per asset; user may set custom weights per portfolio).
The engine is asymmetric on purpose:

1. **BUY THE DIP — FAST (any time, as often as it happens).**
   The moment ANY asset sits **10% below its target slice**, signal a buy back up to target — 2am,
   mid-week, ten times in a wild week. Never miss a crash. This is where growth + lower cost come from.
   **10% cash floor:** the app never spends below 10% of the portfolio's current value in cash —
   only cash above that floor is spendable. If the buy is capped, the signal shows the ideal gap
   and explains the cap. This keeps dry powder for the next dip.

2. **SKIM ON A POP — small (your rule).**
   Whenever a crypto is **up 20% from where you last acted** AND above your average cost, skim **5%
   of that position** to cash, reset its reference, and watch for the next +20% leg. Books real cash
   (~$2,000/yr on a 1-yr horizon); the other 95% keeps riding. *Do not skim bigger or earlier — tested, it kills returns.*

3. **BIG TRIM — slow & patient (monthly).**
   Once a month, if an asset has run **20%+ above its target slice**, trim it back toward target.
   Crypto trends — don't choke a runner. Skim small often; trim big rarely.

4. **GOLD (XAUT) is a full basket member.** When crypto crashes it holds/rises, so it's the "big"
   slice the dip-buying pulls from — safe money funds buying crypto cheap. Automatic.

5. **CRASH BRAKE — optional (OFF in the Growth dial).** If BTC closes 2 weeks below its 200-week
   average, shift half the crypto target into gold+cash until BTC reclaims the line (calmer dial).

*Backtested on a **1-year horizon** (53 rolling windows, real 2021–2026): typical year **+28%** vs
holding's +14%, positive in **68%** of years, beats holding in **64%**, typical worst drop −37%
(vs −47%), banks ~$2,000 cash/yr from skims. Holding only wins the rare monster-bull year; this wins the typical one.*

## B · AQUARI (microcap) — liquidity-aware SELL calculator
Too thin to rebalance. The app holds your hand on exits instead:
1. On a **pump or volume spike**, pull **live liquidity** (pool reserves + volume) from a DEX source.
2. **Compute the safe sell size** — the most you can sell while keeping price impact under ~1–2%
   (constant-product math on the pool reserves), capped at ~20% of the day's volume.
3. **Suggest the clip WITH the reasoning:** "Volume $6k today, depth supports ~$380 before >1.5%
   slippage, you're up X%, this recovers $Y of principal — good window."
4. You place it. The app never trades.
*Data: free first — DexScreener / GeckoTerminal for volume+liquidity, or read Uniswap pool reserves
from a Base RPC and compute slippage directly. The app must ASK the user before using any paid/keyed API.*

## C · BIG-BROTHER LAYER (every signal)
Code decides the move and the number; the **OpenRouter AI only phrases the WHY** in plain words, and
folds in its existing **news scan** as heads-ups. Examples:
- BUY: "buying $X of ETH — it's 11% below target after a dip, lowers your avg cost to ~$Y."
- SKIM: "SOL's up 20% since your last move — skimming $X (5%), banking it, the rest keeps riding."
- TRIM: "monthly check — SOL ran above its slice, trimming $X back to target."
- HOLD: "nothing to do — no asset past a trigger today, here's where each sits."
- NEWS: "heads-up, FOMC tomorrow — expect volatility."
**The AI never computes a trade size or makes a trigger decision. That stays in deterministic code.**

## D · GENERAL / RELATIVE (every portfolio, any size)
- All weights and triggers are **percentages**; the app multiplies by each portfolio's real capital.
- Multiple portfolios run independently; each can hold any mix (crypto, gold, a microcap sleeve).
- **Add money anytime** → new capital enters at target weights; everything recomputes. No size limit.
- The app owns all holdings/capital/weights (its own screens); these files carry NO numbers.
- Advisory only: every suggestion shows the live **dollar** amount and the **reason**.

## E · Invariants (must always hold — test every run)
- I1. A suggested buy never exceeds the portfolio's spendable cash (cash above the 10% floor of portfolio value).
- I2. BUY fires when an asset is ≥10% below target; nothing fires when no trigger is met.
- I3. SKIM = 5% of position, only when up ≥20% from last action AND above avg cost; resets reference after.
- I4. BIG TRIM fires only on the monthly check, only when ≥20% above target.
- I5. AQUARI clip ≤ min(size keeping slippage <~2%, 20% of daily volume).
- I6. Alert only on a real change; never re-spam a standing condition.
- I7. No absolute dollar literal anywhere — all amounts = weight × portfolio capital, app-computed.
- I8. Advisory only: no order/withdraw endpoint or exchange write credential exists.
- I9. The AI is used ONLY for wording/news — never to compute a size or make a trigger decision.
- I10. Every signal carries a plain-language reason and a dollar amount.
- I11. Portfolios are isolated; they share only the read-only BTC circuit-breaker signal.
- I12. No signal is sent unless its dollar value passes sanity validation; failures are logged and surfaced.
- I13. Every signal (sent or suppressed) is durably logged with full context for audit.
- I14. Settings changes require explicit confirmation; large jumps are flagged before save.

## F-extra · Safety Guards (money-math layer)

These sit between the rules engine and the user. Every signal must pass through them.

1. **Signal sanity-check (pre-send validation).**
   Before any signal reaches the user, validate its dollar amount: must be finite, non-negative,
   not exceed spendable cash (buys), not exceed current holdings (sells), and not exceed total
   portfolio value. Signals that fail are **suppressed** — blocked with a plain-language notice
   explaining what went wrong, logged to the audit log, and never sent as a trade suggestion.
   Zero-amount signals (e.g. capped buy at floor) pass through.
   CRASH_BRAKE and MONTHLY signals skip dollar validation (they carry no trade amount).

2. **Audit log (durable record of everything).**
   Every signal — sent or suppressed — is logged to `auditLog` with full metadata: timestamp,
   portfolio, asset, action, dollar amount, price used, data freshness, reason, status
   (sent/suppressed), and suppression reason if applicable. Queryable via `/api/audit`.

3. **Fill-confirmation echo (typo guard on inputs).**
   When the user saves portfolio settings, the app computes a per-field diff against the last saved
   state and presents a confirmation modal before persisting. Large jumps (>30% change in holdings
   or avg cost) and avg cost >50% off the live price are flagged with warnings. Thresholds are
   config-driven (`STRATEGY_CONFIG.safetyGuards`), not hardcoded.

**Invariants added:**
- I12. No signal is sent unless its dollar value passes sanity validation; failures are logged and surfaced.
- I13. Every signal (sent or suppressed) is durably logged with full context for audit.
- I14. Settings changes require explicit confirmation; large jumps are flagged before save.

## F · Verification checklist (the app must build a test for each)
```
[ ] BUY fires at exactly 10% below target; size brings the asset back to target; shown in $ (I2).
[ ] No buy fires when the asset is within 10% of target.
[ ] SKIM fires at +20% from last action & above cost; sells exactly 5%; resets reference (I3).
[ ] SKIM does NOT fire below cost or below +20%.
[ ] BIG TRIM fires only on the monthly check and only when >20% above target (I4).
[ ] Gold is a full basket member — buys/sells like any other asset.
[ ] Sizes scale with portfolio capital; nothing hardcoded; change capital → all $ recompute (I7).
[ ] Dip-buy never reduces cash below 10% of portfolio value; only cash above the floor is spendable (I1).
[ ] Two portfolios of different size run independently (I11).
[ ] Add money → recomputes at target weights; no size cap.
[ ] AQUARI: pulls live liquidity, computes safe sell size <~2% slippage, caps at 20% volume (I5).
[ ] Every signal shows a $ amount AND a plain-language reason (I10).
[ ] AI is never on the path that computes a trade size or trigger (I9).
[ ] Crash brake (if enabled) de-risks below BTC 200wMA, re-risks above.
[ ] No exchange write/trade credential anywhere (I8).
[ ] Alerts fire on transition only — no re-spam of a standing condition (I6).
[ ] Signal sanity-check rejects NaN, negative, Infinity, exceeds-cash, exceeds-holdings (I12).
[ ] Both sent and suppressed signals logged to audit log with full metadata (I13).
[ ] Settings changes show confirmation modal; large jumps flagged with warnings (I14).
```
