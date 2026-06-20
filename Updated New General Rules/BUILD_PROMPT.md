# Cowork Build Prompt — paste this, attach RULES.md + strategy_config.json

You're upgrading the existing alert app to a new strategy. Attached: `RULES.md` (the bible) and
`strategy_config.json` (the rules/percentages — NO holdings or dollar amounts; the app owns those).
`GOAL_TRACKER.md` (also attached) explains why each decision was made — read it for context.

## What this is
A monthly-aware, **buy-fast / sell-slow** rebalanced basket (BTC/ETH/SOL/XAUT gold), plus an AQUARI
liquidity-aware sell calculator, plus a big-brother "explain every move" layer. This REPLACES the old
fixed-dollar dip-ladder engine. Everything is percentage-based and relative to each portfolio's capital.

## Hard rules (do not violate)
- **Advisory only** — the app signals, the user places every order. No trade/withdraw credentials.
- **Deterministic math** — all trade sizes/triggers are plain code from the rules + live prices.
  The OpenRouter AI is used ONLY to (a) phrase the plain-language "why" and (b) provide news heads-ups.
  The AI must NEVER compute a size or make a trigger decision. Keep it off that path entirely.
- **No hardcoded dollars** — every amount = weight × portfolio capital, computed live. The app owns
  all holdings/capital/weights (via its own screens); the config carries no numbers.
- **Free data first** for AQUARI liquidity (DexScreener / GeckoTerminal / on-chain Uniswap reserves via
  a Base RPC). If you think a paid/keyed API is needed, **ASK ME before using it.**

## Step 0 — BEFORE writing any code, reply with:
1. A short plan: what you'll change, what you reuse vs rip out from the current app.
2. Exactly which data source you'll use for AQUARI live liquidity, and **whether you need any API key
   from me** — ask, don't assume.
3. Any place in `RULES.md` you find ambiguous — **ask me to clarify rather than guessing.** These are
   financial rules; do not fill gaps with assumptions.
Wait for my OK on the plan before coding.

## Then build in batches, stopping for my OK after each, re-running tests each time:
- **Batch 1 — Basket engine:** equal-weight BTC/ETH/SOL/XAUT; BUY at 10% below target (fast, any time);
  SKIM 5% at +20% above last action & above cost (reset after); BIG TRIM monthly at 20% above target.
  Confirm sizes scale with capital and nothing is hardcoded.
- **Batch 2 — Multi-portfolio + add-money + dollar display + big-brother wording:** independent
  portfolios; adding capital recomputes; every signal shows the $ amount AND an AI-phrased reason.
- **Batch 3 — AQUARI calculator:** live liquidity → safe sell size <~2% slippage, capped at 20% volume,
  with reasoning shown. Separate bucket.
- **Batch 4 — Crash brake (optional, default OFF)** per RULES.md A.5.

## Tests (required — this is how we verify the app follows the rules)
Build an automated test for **every line in RULES.md §F** and assert **every invariant in §E**.
Use the existing test harness (mock store) like before. After each batch: show me the diff AND the
test output (which §F lines pass/fail). Do not call a batch done until its tests are green.
If a rule and the code ever disagree, the rule wins — flag it and ask me.
