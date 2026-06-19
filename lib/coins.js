export const COIN_COLORS = {
  BTC: { border: 'border-t-orange-500', label: 'text-orange-400', badge: 'bg-orange-500/10 text-orange-400 border border-orange-500/20' },
  ETH: { border: 'border-t-indigo-400', label: 'text-indigo-400', badge: 'bg-indigo-400/10 text-indigo-400 border border-indigo-400/20' },
  SOL: { border: 'border-t-purple-500', label: 'text-purple-400', badge: 'bg-purple-500/10 text-purple-400 border border-purple-500/20' },
  AQUARI: { border: 'border-t-cyan-400', label: 'text-cyan-400', badge: 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/20' },
  XAUT: { border: 'border-t-yellow-500', label: 'text-yellow-400', badge: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' },
};

export const DEFAULT_COLOR = { border: 'border-t-zinc-500', label: 'text-zinc-400', badge: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20' };

export function coinBadge(coin) {
  const c = COIN_COLORS[coin] || DEFAULT_COLOR;
  return c.badge;
}
