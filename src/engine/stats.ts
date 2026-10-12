export function mean(xs: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
}

export function sd(xs: ArrayLike<number>): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

export function sorted(xs: ArrayLike<number>): Float64Array {
  return Float64Array.from(xs).sort();
}

/** Type 7 (linear interpolation), on sorted input. */
export function quantileSorted(s: ArrayLike<number>, p: number): number {
  if (s.length === 0) return Number.NaN;
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}

export function quantile(xs: ArrayLike<number>, p: number): number {
  return quantileSorted(sorted(xs), p);
}

export function ranks(xs: ArrayLike<number>): Float64Array {
  const n = xs.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const out = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && xs[order[j + 1]] === xs[order[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k]] = r;
    i = j + 1;
  }
  return out;
}

export function pearson(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

export function spearman(x: ArrayLike<number>, y: ArrayLike<number>): number {
  return pearson(ranks(x), ranks(y));
}

export interface Bin {
  lo: number;
  hi: number;
  count: number;
}

export function histogram(xs: ArrayLike<number>, target = 30): Bin[] {
  const s = sorted(xs);
  const lo = s[0];
  const hi = s[s.length - 1];
  if (!(hi > lo)) return [{ lo, hi, count: s.length }];
  const step = niceStep((hi - lo) / target);
  const start = Math.floor(lo / step) * step;
  const n = Math.max(1, Math.ceil((hi - start) / step + 1e-9));
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({ lo: start + i * step, hi: start + (i + 1) * step, count: 0 }));
  for (let i = 0; i < s.length; i++) {
    const k = Math.min(n - 1, Math.floor((s[i] - start) / step));
    bins[k].count++;
  }
  return bins;
}

export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * power) return m * power;
  return 10 * power;
}
