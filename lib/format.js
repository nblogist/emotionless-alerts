export function fmtUsd(n) {
  return n != null ? `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '\u2014';
}

export function fmtPrice(n) {
  if (n == null) return '\u2014';
  if (n < 0.01) return `$${Number(n).toFixed(6)}`;
  return n < 10 ? `$${n.toFixed(2)}` : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function fmtCoinAmt(n) {
  if (n == null || n === 0) return '0';
  if (n >= 1000) return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.001) return n.toFixed(6);
  return n.toFixed(8);
}
