const HIGH_IMPACT_KEYWORDS = [
  // Central banks & rates
  'interest rate', 'rate decision', 'rate hike', 'rate cut', 'basis points', 'bps',
  'federal reserve', 'fomc', 'powell', 'fed rate',
  'bank of japan', 'boj', 'yen crisis',
  'ecb', 'european central bank', 'lagarde',
  'pboc', 'china central bank',
  // Economic data
  'inflation', 'cpi data', 'gdp ', 'unemployment', 'jobs report', 'nonfarm',
  'quantitative easing', 'quantitative tightening',
  // Crypto regulation & policy
  'sec crypto', 'sec lawsuit', 'sec approv', 'etf approv', 'etf reject', 'etf filing',
  'crypto regulation', 'crypto ban', 'crypto law',
  'stablecoin regulation', 'cbdc',
  // Market events
  'hack', 'exploit', 'rug pull', 'collapse', 'insolvency', 'bankrupt',
  'liquidation', 'flash crash', 'black swan',
  'halving', 'bitcoin halving',
  // Geopolitics
  'tariff', 'trade war', 'sanction', 'war ', 'conflict',
  // Stablecoins
  'tether', 'usdt depeg', 'usdc depeg', 'stablecoin',
  // Major moves
  'all-time high', 'ath', 'record high', 'record low',
  'whale', 'large transfer',
];

export async function fetchMarketNews() {
  try {
    const res = await fetch(
      'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=popular',
      { cache: 'no-store' }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const articles = data.Data || [];

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const filtered = articles
      .filter((a) => a.published_on * 1000 > oneDayAgo)
      .filter((a) => {
        const text = `${a.title} ${a.body || ''}`.toLowerCase();
        return HIGH_IMPACT_KEYWORDS.some((kw) => text.includes(kw));
      })
      .slice(0, 5)
      .map((a) => ({
        title: a.title,
        source: a.source_info?.name || a.source || 'Unknown',
        url: a.url,
        published: new Date(a.published_on * 1000).toISOString(),
        categories: a.categories || '',
      }));

    return filtered;
  } catch (e) {
    console.error('News fetch error:', e.message);
    return [];
  }
}

export function formatNewsAlert(articles) {
  if (!articles.length) return null;
  let msg = 'MARKET NEWS — may affect your positions:\n';
  for (const a of articles) {
    msg += `\n• ${a.title} (${a.source})`;
  }
  return msg;
}
