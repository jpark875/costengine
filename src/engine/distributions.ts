import type { Rng } from "./random.js";

/** An uncertain input. Every parameter is in the input's own units. */
export type Dist =
  | { kind: "fixed"; value: number }
  | { kind: "normal"; mean: number; sd: number; min?: number; max?: number }
  | { kind: "lognormal"; mean: number; sd: number }
  | { kind: "uniform"; min: number; max: number }
  | { kind: "triangular"; min: number; mode: number; max: number }
  | { kind: "pert"; min: number; mode: number; max: number };

export const DIST_KINDS = ["fixed", "normal", "lognormal", "uniform", "triangular", "pert"] as const;

export function fixed(value: number): Dist {
  return { kind: "fixed", value };
}

export function isUncertain(d: Dist): boolean {
  switch (d.kind) {
    case "fixed":
      return false;
    case "normal":
    case "lognormal":
      return d.sd > 0;
    default:
      return d.max > d.min;
  }
}

/** Analytic mean (for a truncated normal, of the untruncated one). */
export function distMean(d: Dist): number {
  switch (d.kind) {
    case "fixed":
      return d.value;
    case "normal":
    case "lognormal":
      return d.mean;
    case "uniform":
      return (d.min + d.max) / 2;
    case "triangular":
      return (d.min + d.mode + d.max) / 3;
    case "pert":
      return (d.min + 4 * d.mode + d.max) / 6;
  }
}

/** Smallest value a draw can take (a normal without a floor counts as six sd below). */
export function lowerBound(d: Dist): number {
  switch (d.kind) {
    case "fixed":
      return d.value;
    case "normal":
      return d.min ?? d.mean - 6 * d.sd;
    case "lognormal":
      return 0;
    default:
      return d.min;
  }
}

export function upperBound(d: Dist): number {
  switch (d.kind) {
    case "fixed":
      return d.value;
    case "normal":
      return d.max ?? d.mean + 6 * d.sd;
    case "lognormal":
      return Infinity;
    default:
      return d.max;
  }
}

/** Problems with a distribution's parameters, as readable messages (empty if valid). */
export function problems(d: Dist, label: string): string[] {
  const out: string[] = [];
  const values = Object.entries(d).filter(([k]) => k !== "kind");
  for (const [k, v] of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) out.push(`${label}: ${k} must be a number`);
  }
  if (out.length) return out;
  switch (d.kind) {
    case "normal":
      if (d.sd < 0) out.push(`${label}: sd must not be negative`);
      if (d.min !== undefined && d.max !== undefined && d.min >= d.max)
        out.push(`${label}: min must be below max`);
      if (d.min !== undefined && d.max !== undefined && (d.mean < d.min - 4 * d.sd || d.mean > d.max + 4 * d.sd))
        out.push(`${label}: the truncation range leaves almost no probability`);
      break;
    case "lognormal":
      if (d.mean <= 0) out.push(`${label}: a lognormal mean must be positive`);
      if (d.sd < 0) out.push(`${label}: sd must not be negative`);
      break;
    case "uniform":
      if (d.min > d.max) out.push(`${label}: min must not exceed max`);
      break;
    case "triangular":
    case "pert":
      if (!(d.min <= d.mode && d.mode <= d.max)) out.push(`${label}: need min ≤ mode ≤ max`);
      break;
    case "fixed":
      break;
  }
  return out;
}

const MAX_REJECTIONS = 10_000;

export function sample(d: Dist, rng: Rng): number {
  switch (d.kind) {
    case "fixed":
      return d.value;
    case "normal": {
      if (d.sd === 0) return d.mean;
      const lo = d.min ?? -Infinity;
      const hi = d.max ?? Infinity;
      for (let i = 0; i < MAX_REJECTIONS; i++) {
        const x = d.mean + d.sd * rng.normal();
        if (x >= lo && x <= hi) return x;
      }
      return Math.min(Math.max(d.mean, lo), hi);
    }
    case "lognormal": {
      if (d.sd === 0) return d.mean;
      const sigma2 = Math.log(1 + (d.sd / d.mean) ** 2);
      const mu = Math.log(d.mean) - sigma2 / 2;
      return Math.exp(mu + Math.sqrt(sigma2) * rng.normal());
    }
    case "uniform":
      return d.min + (d.max - d.min) * rng.next();
    case "triangular": {
      const { min: a, mode: c, max: b } = d;
      if (b === a) return a;
      const u = rng.next();
      const f = (c - a) / (b - a);
      return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
    }
    case "pert": {
      const { min: a, mode: m, max: b } = d;
      if (b === a) return a;
      const alpha = 1 + (4 * (m - a)) / (b - a);
      const beta = 1 + (4 * (b - m)) / (b - a);
      return a + (b - a) * rng.beta(alpha, beta);
    }
  }
}

export function describe(d: Dist): string {
  const f = (x: number) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString("en-US") : String(+x.toPrecision(4)));
  switch (d.kind) {
    case "fixed":
      return f(d.value);
    case "normal":
      return `normal(${f(d.mean)}, sd ${f(d.sd)})`;
    case "lognormal":
      return `lognormal(mean ${f(d.mean)}, sd ${f(d.sd)})`;
    case "uniform":
      return `uniform(${f(d.min)} to ${f(d.max)})`;
    case "triangular":
      return `triangular(${f(d.min)}, ${f(d.mode)}, ${f(d.max)})`;
    case "pert":
      return `PERT(${f(d.min)}, ${f(d.mode)}, ${f(d.max)})`;
  }
}
