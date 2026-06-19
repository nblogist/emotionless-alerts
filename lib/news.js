const HIGH_IMPACT_KEYWORDS = [
  // Central banks & monetary policy
  'interest rate', 'rate decision', 'rate hike', 'rate cut', 'basis points', 'bps',
  'federal reserve', 'fomc', 'powell', 'fed rate', 'fed pivot',
  'bank of japan', 'boj', 'yen crisis', 'yen carry',
  'ecb', 'european central bank', 'lagarde',
  'pboc', 'china central bank', 'yuan devaluation',
  'rba', 'bank of england', 'boe',
  // Economic data
  'inflation', 'cpi data', 'gdp ', 'unemployment', 'jobs report', 'nonfarm',
  'quantitative easing', 'quantitative tightening', 'bond yield', 'treasury',
  'recession', 'stagflation', 'debt ceiling', 'default risk',
  // Geopolitics & conflict
  'war ', 'conflict', 'military strike', 'invasion', 'ceasefire', 'peace deal',
  'iran', 'north korea', 'taiwan strait', 'middle east', 'escalation',
  'missile', 'nuclear', 'nato',
  // Trade & sanctions
  'tariff', 'trade war', 'sanction', 'embargo', 'export ban', 'chip ban',
  // Crypto regulation & events
  'sec crypto', 'sec lawsuit', 'sec approv', 'etf approv', 'etf reject', 'etf filing',
  'crypto regulation', 'crypto ban', 'crypto law', 'executive order crypto',
  'stablecoin regulation', 'cbdc',
  'hack', 'exploit', 'rug pull', 'collapse', 'insolvency', 'bankrupt',
  'liquidation', 'flash crash', 'black swan',
  'halving', 'bitcoin halving',
  'tether', 'usdt depeg', 'usdc depeg', 'stablecoin',
  // Market structure
  'all-time high', 'ath', 'record high', 'record low',
  'whale', 'large transfer', 'market open', 'market close',
  'circuit breaker', 'stock crash', 'nasdaq', 'sp500', 's&p',
  'oil price', 'gold price', 'dxy', 'dollar index',
];

/**
 * Fetch recent popular crypto news from CryptoCompare.
 * @param {Object} opts
 * @param {boolean} opts.filterKeywords - Apply HIGH_IMPACT_KEYWORDS filter (default: true)
 * @param {number} opts.limit - Max articles to return (default: 5)
 */
async function fetchNews({ filterKeywords = true, limit = 5 } = {}) {
  try {
    const res = await fetch(
      'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=popular',
      { cache: 'no-store' }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const articles = data.Data || [];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    let filtered = articles.filter((a) => a.published_on * 1000 > oneDayAgo);

    if (filterKeywords) {
      filtered = filtered.filter((a) => {
        const text = `${a.title} ${a.body || ''}`.toLowerCase();
        return HIGH_IMPACT_KEYWORDS.some((kw) => text.includes(kw));
      });
    }

    return filtered
      .slice(0, limit)
      .map((a) => ({
        title: a.title,
        source: a.source_info?.name || a.source || 'Unknown',
        url: a.url,
        published: new Date(a.published_on * 1000).toISOString(),
        categories: a.categories || '',
      }));
  } catch (e) {
    console.error('News fetch error:', e.message);
    return [];
  }
}

/** Keyword-filtered news (fallback when AI is unavailable). */
export function fetchMarketNews() {
  return fetchNews({ filterKeywords: true, limit: 5 });
}

/** All recent news (unfiltered) for AI analysis. */
export function fetchAllRecentNews() {
  return fetchNews({ filterKeywords: false, limit: 20 });
}

/**
 * Send news headlines to OpenRouter AI for impact analysis on portfolio holdings.
 * Returns array of relevant items with sentiment and insight, or null on failure.
 */
export async function analyzeNewsWithAI(articles, portfolioCoins) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || articles.length === 0) return null;

  const headlines = articles
    .map((a, i) => `${i + 1}. "${a.title}" — ${a.source}`)
    .join('\n');

  const coins = portfolioCoins.join(', ');

  const prompt = `You are a macro-aware crypto analyst. Portfolio holds: ${coins}.

Analyze these headlines for anything that could move crypto markets:

${headlines}

Think broadly about second-order effects:
- Central bank rate changes (BoJ BPS changes affect yen carry trade → risk assets)
- US market open/close dynamics that move crypto
- Geopolitical escalation or peace deals (war = risk-off, peace = risk-on)
- Liquidity events (QT, debt ceiling, treasury issuance)
- Regulatory signals (SEC, executive orders, country-level bans/adoption)
- Correlation trades (DXY strength = crypto weakness, oil spikes = inflation fear)

Return a JSON array of headlines that could materially affect positions. For each:
- "num": headline number (1-indexed)
- "coins": affected coins from portfolio, or ["ALL"] for macro events
- "direction": "bullish" | "bearish" | "neutral"
- "insight": 1-sentence actionable take (under 80 chars)

Be selective but don't miss macro. Return [] if nothing is material. JSON array only, no markdown.`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      console.error('OpenRouter error:', res.status);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const analysis = JSON.parse(jsonStr);
    if (!Array.isArray(analysis)) return null;

    return analysis
      .filter((item) => item.num >= 1 && item.num <= articles.length)
      .map((item) => ({
        title: articles[item.num - 1].title,
        source: articles[item.num - 1].source,
        url: articles[item.num - 1].url,
        published: articles[item.num - 1].published,
        coins: item.coins || [],
        direction: item.direction || 'neutral',
        insight: item.insight || '',
      }));
  } catch (e) {
    console.error('AI news analysis error:', e.message);
    return null;
  }
}

/**
 * Format AI analysis into a Telegram/email alert message.
 */
export function formatAINewsAlert(analysis) {
  if (!analysis || analysis.length === 0) return null;

  const arrows = { bullish: '\u2197', bearish: '\u2198', neutral: '\u2192' };
  let msg = 'AI NEWS SCAN \u2014 headlines that may affect your positions:\n';
  for (const item of analysis) {
    const arrow = arrows[item.direction] || '\u2192';
    msg += `\n${arrow} ${item.title}`;
    msg += `\n   ${item.coins.join(', ')} \u2014 ${item.insight}`;
  }
  return msg;
}

/**
 * Format keyword-filtered news into a Telegram/email alert message (fallback).
 */
export function formatNewsAlert(articles) {
  if (!articles.length) return null;
  let msg = 'MARKET NEWS \u2014 may affect your positions:\n';
  for (const a of articles) {
    msg += `\n\u2022 ${a.title} (${a.source})`;
  }
  return msg;
}
