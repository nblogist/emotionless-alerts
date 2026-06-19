# Emotionless Trading Rules — Machine Spec (v3)

> This file is the **single source of truth** for the alert app. Every rule below is
> deterministic: one trigger → one action → one exact amount. No judgment calls.
> Claude Code: treat each numbered rule and every line in §8 as a testable assertion.
> If the app's behavior disagrees with this file, **the app is wrong**, not this file.

**Scope:** Spot only. BTC / ETH / SOL only. Never leverage. Alert-only — the app never
places orders. Total strategy capital is fixed at **$15,000** and never increases.

---

## 1 · Constants (the app reads these; never hardcodes them elsewhere)

| Constant | Value | Meaning |
|---|---|---|
| `TOTAL_CAPITAL` | $15,000 | Hard ceiling. Sum of all deployed + powder + reserve never exceeds this. |
| `PER_COIN_CAP` | $5,000 | No single coin ever holds more than this (cost basis deployed). |
| `STARTER_PER_COIN` | $2,000 | Initial position per coin (already deployed). |
| `LADDER_PER_COIN` | $2,500 | Dry powder per coin for dip rungs. |
| `RESERVE_PER_COIN` | $500 | Deep-crash reserve per coin. Released only on floor-confirm. |
| `BUY_STEP` | 7% | Price must fall this far below the last action to arm the next rung. |
| `SELL_FIRST` | +40% | First trim triggers here, measured over `avgCost`. |
| `SELL_STEP` | +25% | Each further trim, **additive over avgCost** (so 40%, 65%, 90%). |
| `TRIM_PCT` | 15% | Each trim sells this much of the sell-baseline units. |
| `CORE_RIDE` | 55% | Fraction of position that is NEVER trimmed; rides under trailing stop. |
| `TRAIL_STOP` | 25% | Riding core sells if price falls this far from its peak. |
| `UPSIDE_BREAK` | $90,000 | BTC weekly close above this → deploy-everything signal. |

Per-coin math checks out: 2,000 + 2,500 + 500 = **$5,000 = PER_COIN_CAP**. ✓
Across 3 coins: 6,000 starter + 7,500 ladder + 1,500 reserve = **$15,000**. ✓

---

## 2 · The buy ladder — EXACTLY how much, per coin

This is the part the old rules were missing. Each coin has a fixed, escalating rung
ladder. Rungs fire **in order**, one at a time. "Deeper dip, harder buy" is now literal.

| Rung | Amount (USD) | Arms when… | Cumulative deployed |
|---|---|---|---|
| Rung 1 | **$400** | price ≤ 7% below `buyReference` | $400 |
| Rung 2 | **$600** | price ≤ 7% below the Rung-1 fill price | $1,000 |
| Rung 3 | **$700** | price ≤ 7% below the Rung-2 fill price | $1,700 |
| Rung 4 | **$800** | price ≤ 7% below the Rung-3 fill price | $2,500 |
| Reserve | **$500** | floor-confirmed in deep zone (§4) | $3,000 |

Each rung is strictly larger than the one before (400 < 600 < 700 < 800). After the four
ladder rungs ($2,500) plus the reserve ($500), the coin is at its $5,000 cap and **buying stops**.

**Buy trigger logic (deterministic):**
1. Maintain `buyReference` per coin = price of the **last action** (last buy fill, or the
   starter entry if no rung has filled yet).
2. On each run, for each coin: if `livePrice ≤ buyReference × (1 − BUY_STEP)` **and** the
   drawdown governor (§4) is not in PAUSE, **alert the next unfired rung** with its exact dollar amount.
3. Fire **at most one rung per coin per run**, even if price gapped through two triggers.
   (The human executes, updates `buyReference` to the fill price, and the next run handles the next rung.)
4. Never move a reference up on a bounce. Never deploy a rung "early." Powder only moves at a trigger.

---

## 3 · The sell ladder — EXACTLY how much, per coin

Tuned to let winners run: trims are small, start late, and **55% of the position is never sold** —
it rides under a trailing stop so a 5x can't happen without you.

When a coin first crosses `avgCost × 1.40`, **lock the sell baseline** = units held at that moment.
All trims are a percentage of that baseline, not of the shrinking balance.

| Trim | Sell amount | Triggers when price ≥ |
|---|---|---|
| Trim 1 | 15% of baseline units | `avgCost × 1.40` |
| Trim 2 | 15% of baseline units | `avgCost × 1.65` |
| Trim 3 | 15% of baseline units | `avgCost × 1.90` |
| — stop — | (45% sold, 55% rides) | no further trims |
| Trailing exit | sell the remaining 55% | price falls 25% from its peak-since-green |

**Sell trigger logic (deterministic):**
1. Trims fire in order, one per run, only when their price level is reached.
2. After 3 trims, **stop trimming**. The remaining core rides.
3. Track `peakPrice` since the position went green. If `livePrice ≤ peakPrice × (1 − TRAIL_STOP)`,
   alert to sell the entire remaining core. This is the only thing that sells the core.
4. All sale proceeds go to **USDT** and stay there. Never recycle into a new coin — only back
   into BTC/ETH/SOL via the §2 ladder.
5. A buy fill **never** triggers a sell, and a sell fill never triggers a buy. The two ladders
   are independent and never share a reference point.

---

## 4 · Drawdown governor — the falling-knife safety overlay

Measured from `cycleHigh` (highest daily close in the trailing 365 days). This overlay can
**PAUSE** the buy ladder regardless of §2 triggers.

| Drawdown from cycleHigh | State | Buy ladder behavior |
|---|---|---|
| 0% to −20% | NORMAL | Rungs fire on §2 triggers. |
| −20% to −35% | CORRECTION | Rungs fire on §2 triggers. Stay calm. |
| −35% to −50% | **PAUSE** | **Do not fire any rung.** Wait for floor. |
| Floor confirmed | RESERVE | Deploy the $500 reserve rung. |

**Floor confirmed** = while in the −35%/−50% zone, price posts **2 consecutive weekly closes
above the lowest weekly close seen in that drawdown.** Only then is the reserve released.

This is the "let the knife hit the floor before the big buy" rule, made mechanical.

---

## 5 · Circuit breakers — checked on weekly close

| Breaker | Condition | Action alerted |
|---|---|---|
| **Thesis break** | BTC posts **2 consecutive weekly closes below its 200-week MA** | Cancel open rungs, stop buying, **hold** (do not panic-sell). |
| **Re-entry** | After a thesis break, BTC posts **1 weekly close back above the 200-week MA** | Resume the §2 ladder. |
| **Upside break** | BTC weekly close **> $90,000** | Deploy **40% of all remaining powder** (ladder + reserve) at market that day. |

Note: SOL lacks a full 200 weeks of history; for SOL only, the thesis-break MA uses the
longest available window until 200 weekly closes accrue. BTC is the real circuit and is unaffected.

---

## 6 · Monthly hand-hold

On the **1st of each month**, send a status summary even if no rule fired: each coin's price,
distance to its next buy rung, distance to its next sell trim, drawdown state, and powder remaining.
This is the only scheduled "nothing's wrong, here's where you stand" message.

---

## 7 · Invariants — must ALWAYS be true (great for property tests)

These are not triggers; they are conditions the app must never violate. Test them on every run.

- **I1.** Sum of (deployed cost basis across all coins + powder remaining + reserve remaining) ≤ `TOTAL_CAPITAL`.
- **I2.** For every coin: deployed cost basis ≤ `PER_COIN_CAP`. A rung that would breach this does not fire.
- **I3.** A rung never fires unless `livePrice ≤ buyReference × 0.93`.
- **I4.** No more than one buy rung and one sell trim per coin per run.
- **I5.** While drawdown state = PAUSE, zero buy rungs fire.
- **I6.** The reserve rung fires only after a floor-confirm event, never before.
- **I7.** The core (≥55% of a position's sell-baseline) is only ever sold by the trailing stop, never by a trim.
- **I8.** The app issues an alert only on a **transition** into a condition — never re-alerts the
  same standing condition on consecutive runs.
- **I9.** The app never calls any order/trade/withdraw endpoint. It has no exchange write credentials. Read-only price data only.
- **I10.** Every dollar figure the app uses comes from §1 constants or `config.json`, never a hardcoded literal elsewhere.

---

## 8 · Verification checklist for Claude Code

Turn each line into an automated test against the built app. The app passes only if all pass.

```
[ ] Buy rung 1 alerts at exactly −7% from buyReference, for amount $400.
[ ] Rung amounts escalate 400 → 600 → 700 → 800, then reserve 500, then STOP.
[ ] A 5th ladder buy never fires; coin caps at $5,000 deployed (I2).
[ ] Two triggers crossed in one run → only ONE rung alert fires (I4).
[ ] Drawdown −40% from high → buy ladder PAUSES; no rung fires even on a −7% step (I5).
[ ] Reserve rung fires ONLY after 2 weekly closes above the drawdown low (I6, §4).
[ ] Sell trim 1 fires at avgCost ×1.40 for 15% of baseline units; trims 2/3 at ×1.65, ×1.90.
[ ] After 3 trims, no further trim fires; 55% remains (I7).
[ ] Trailing stop sells the remaining core at −25% from peak-since-green, and nothing else does (I7).
[ ] Thesis break fires on 2 weekly closes below BTC 200w MA; re-entry on 1 close above (§5).
[ ] Upside break fires on BTC weekly close > $90,000, sizing = 40% of remaining powder (§5).
[ ] 1st-of-month summary sends even when no other rule fires (§6).
[ ] Same standing condition does NOT re-alert on the next run (I8).
[ ] App has no exchange write/trade credentials anywhere in the codebase (I9).
[ ] Total + per-coin caps hold after every simulated fill (I1, I2).
[ ] No dollar amount is hardcoded outside config/constants (I10).
```

---

*Defaults above assume the standard $2,000 starter per coin. If `config.json` holds different
real positions, the **invariants** (§7) govern — caps and the never-exceed rules always win over
the example rung sizes. Not financial advice.*
