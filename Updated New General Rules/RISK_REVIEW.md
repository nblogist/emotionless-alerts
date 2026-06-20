# RISK REVIEW — "Aladdin Desk" Sanity Check
### Independent risk assessment of the BTC/ETH/SOL v4 strategy

> Written in the voice of an institutional risk desk reviewing a strategy before it goes live.
> This is educational risk analysis, not financial advice, and not a recommendation to trade.
> I am not a licensed financial advisor. Numbers are from the v4 backtest (2021–2026).

---

## 1 · Strategy classification
Long-only, spot, **equal-weight 3-asset crypto basket** with a mechanical overlay:
dip-accumulation (scale-in on −7% steps), profit-harvesting (scale-out at 2×/3×/4×), a
volatility trailing stop (quarter-out on −30%), and a **trend circuit breaker** (BTC 200-week MA).
In plain terms: **risk-managed crypto beta.** It is net-long the crypto cycle with a cash overlay
that reduces participation near tops and adds near dips.

## 2 · Headline risk metrics (vs naive buy-and-hold, 14 rolling 2-yr windows)
| | Strategy | Buy & hold |
|---|---|---|
| Median return | +99% | +101% |
| Median max drawdown | **−30%** | −55% |
| Worst-case max drawdown | −60% | −95% |
| Return / drawdown (median) | ~3.3 | ~1.8 |
**Verdict on the numbers:** comparable median return at **~half the drawdown** → materially
better risk-adjusted profile. The strategy's value is *risk reduction*, not return enhancement.

## 3 · What the desk would APPROVE
- **No leverage → no liquidation risk.** Single most important feature. A spot book cannot be
  forced-sold at the bottom. This alone puts it ahead of most retail crypto strategies.
- **Hard position caps ($5k/coin, $15k total).** Bounded, pre-committed exposure. No way to
  over-deploy in a panic.
- **Mechanical, pre-committed rules.** Removes discretionary drawdown-chasing — the dominant
  cause of retail blow-ups.
- **Demonstrated lower drawdown** than the passive benchmark across every tested window.

## 4 · What the desk would FLAG (the real risks)
**A. "3 coins" is not 3 bets — correlation risk.** BTC/ETH/SOL routinely correlate 0.7–0.9.
In a crash they fall together; equal-weight ≠ diversified. The effective number of independent
bets is closer to ~1.5. The drawdown protection comes from the **cash overlay and circuit
breaker**, not from diversification. Do not mistake this for a diversified book.

**B. Single-asset regime dependency.** The entire portfolio's buy/stop logic keys off **BTC's**
200-week MA. If ETH or SOL breaks down structurally while BTC holds, the system keeps buying
those falling knives. BTC is a decent proxy for "crypto regime" but it is not ETH/SOL risk.

**C. Overfitting / sample risk (the big one).** Backtested on **2021–2026 = one bear + one bull,
n≈1 cycle.** Parameters (−7%, +100%, −30%, 200wMA) are partly tuned to this path. Out-of-sample
behavior can differ. SOL also lacks a true 200-week history and its 2024–2026 prices were
reconstructed from market cap — treat SOL results as approximate. **Confidence band is wide.**

**D. Circuit-breaker whipsaw.** The 200wMA thesis-break/re-entry flipped 3–4 times in 2022–2023,
often near local extremes — it stopped buying near the 2022 bottom and re-entered higher.
MA regime filters are known to whipsaw in chop. This is a real, recurring cost, not a one-off.

**E. Stablecoin / counterparty concentration.** All proceeds park in **USDT**. Over a full cycle
the book becomes mostly USDT. That concentrates **stablecoin depeg + issuer + exchange-custody
risk** — arguably the largest *unmodeled* tail. The backtest assumes USDT = $1.00 always; reality
has not always agreed. Consider splitting cash across USDC/USDT and venues.

**F. Gap / tail risk.** Triggers are checked daily/weekly. Crypto can gap 30–50% overnight or on
a weekend; a stop or band can be jumped through, so realized fills may be worse than modeled.
Worst modeled drawdown −60%; a true tail (exchange failure, depeg, black-swan gap) could exceed it.

**G. Execution drag not in the backtest.** Fees, spread, and especially **taxes on every trim**
(each is a taxable event in many jurisdictions) are not modeled. Frequent harvesting raises tax
drag. On BTC/ETH/SOL, slippage at $15k size is negligible (deep liquidity) — unlike microcaps.

**H. Operator/behavioral risk.** It is alert-only and requires the human to execute on ugly days.
The #1 failure mode is the operator overriding the rules in fear or greed — which is precisely
what the system exists to prevent. Discipline is the actual edge; if it breaks, the edge is gone.

## 5 · Stress scenarios the desk would run
- **Prolonged grind-down bear (worse than 2022):** powder exhausts early, circuit breaker holds
  you in cash — protective, but you re-enter higher on whipsaw. Expected: large outperformance vs HODL.
- **Straight vertical bull (like 2023–2024):** cash drag causes significant underperformance vs HODL.
  This is the expected, accepted cost. Do not be surprised by it.
- **USDT depeg event:** not modeled; could impair the cash leg directly. Mitigate by diversifying stables.
- **Single-name SOL collapse with BTC stable:** system keeps buying SOL to its $5k cap. Cap limits
  damage to ≤ $5k; acceptable by design but worth knowing.

## 6 · Desk verdict
**Sane, conservative, well-bounded long-crypto strategy.** Approved as a *risk-managed beta*
sleeve, **not** as an alpha or outperformance strategy. It delivers buy-and-hold-like median
returns with roughly half the drawdown and zero liquidation risk — a legitimately better
risk-adjusted profile — at the cost of the upside right tail.

**Top 3 things to fix / watch before sizing up:**
1. **Diversify the cash leg** (USDT depeg is your biggest unmodeled tail).
2. **Treat the backtest as one sample, not a guarantee** — it's tuned on a single cycle; size accordingly.
3. **Honor the rules mechanically** — the entire edge is discipline; overriding it removes the protection.

*Position sizing, suitability, and tax treatment are personal decisions. This review describes
risk characteristics; it is not advice to buy, sell, or hold any asset.*
