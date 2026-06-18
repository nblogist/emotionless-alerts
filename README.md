# Emotionless Alerts

Rule-based crypto trading alert system. No emotions, just rules.

A Vercel cron job that checks BTC/ETH/SOL prices daily, evaluates trading rules, and sends Telegram alerts **only when a rule fires**. It never trades. Silence = "do nothing."

## Setup

### 1. Environment Variables (set in Vercel dashboard)

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Create via @BotFather on Telegram |
| `UPSTASH_REDIS_REST_URL` | Yes | Free at upstash.com |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Free at upstash.com |
| `COINGECKO_KEY` | No | Optional, for higher rate limits |

### 2. Telegram Setup

1. Message `@BotFather` on Telegram, create a new bot
2. Copy the bot token → set as `TELEGRAM_BOT_TOKEN`
3. Send any message to your bot
4. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your chat ID
5. Enter the chat ID in Settings page

### 3. Upstash Redis (free tier)

1. Sign up at [upstash.com](https://upstash.com)
2. Create a Redis database (free tier)
3. Copy REST URL and Token → set as env vars

## Rules

| Rule | Condition | Alert |
|------|-----------|-------|
| Buy Band | Price drops 7% below buy reference | Deploy next rung |
| Sell Trigger | Price rises 40%+ above avg cost | Trim 15% |
| Drawdown Zone | Price drops -20%, -35%, -50% from cycle high | Zone warning |
| Floor Confirmed | 2 weekly closes above lowest, in -35/-50 zone | Reserve unlocked |
| Thesis Break | BTC 2 weekly closes below 200-week MA | Stop buying |
| Upside Break | BTC weekly close > $90,000 | Deploy 40% powder |
| Monthly Check | 1st of month | Portfolio summary |

## After a Trade

**Buy fills:** Go to Settings → lower Buy Reference to fill price, reduce Powder, update Holdings and Avg Cost.

**Sell fills:** Go to Settings → update Holdings.

## Pause the Bot

Disable the cron in the Vercel dashboard under your project's Cron Jobs tab.
