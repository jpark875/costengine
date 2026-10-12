export function discount(rate: number, t: number): number {
  return 1 / (1 + rate) ** t;
}

export function presentValue(flows: ArrayLike<number>, rate: number): number {
  let total = 0;
  for (let t = 0; t < flows.length; t++) total += flows[t] * discount(rate, t);
  return total;
}

/** NaN unless the stream changes sign; the root is searched between -99% and 1,000%. */
export function irr(flows: ArrayLike<number>): number {
  let pos = false;
  let neg = false;
  for (let i = 0; i < flows.length; i++) {
    if (flows[i] > 0) pos = true;
    if (flows[i] < 0) neg = true;
  }
  if (!pos || !neg) return Number.NaN;
  let lo = -0.99;
  let hi = 10;
  let fLo = presentValue(flows, lo);
  const fHi = presentValue(flows, hi);
  if (Math.sign(fLo) === Math.sign(fHi)) return Number.NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = presentValue(flows, mid);
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

export function payback(netDiscounted: ArrayLike<number>): number | null {
  let total = 0;
  for (let t = 0; t < netDiscounted.length; t++) {
    total += netDiscounted[t];
    if (total >= 0 && t > 0) return t;
  }
  return null;
}
