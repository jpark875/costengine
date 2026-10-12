import { type Dist, describe, isUncertain, sample } from "./distributions.js";
import { discount, irr, payback } from "./finance.js";
import { Rng } from "./random.js";
import { PERSPECTIVES, type Perspective, type Scenario, validate } from "./scenario.js";
import { histogram, mean, quantileSorted, sd, sorted, spearman, type Bin } from "./stats.js";

export interface Input {
  id: string;
  label: string;
  dist: Dist;
}

interface Plan {
  inputs: Input[];
  discountRate: number;
  deadweight: number;
  implementation: number;
  costs: { amount: number; start: number; years: number; payer: Perspective }[];
  effects: { size: number; decay: number; start: number; years: number; values: { perspective: Perspective; perUnit: number }[] }[];
}

export function plan(s: Scenario): Plan {
  const inputs: Input[] = [];
  const add = (id: string, label: string, dist: Dist) => {
    inputs.push({ id, label, dist });
    return inputs.length - 1;
  };
  return {
    inputs,
    discountRate: add("discountRate", "Discount rate", s.discountRate),
    deadweight: add("deadweight", "Deadweight cost of taxation", s.deadweight),
    implementation: add("implementation", "Implementation factor", s.implementation),
    costs: s.costs.map((c) => ({
      amount: add(`cost:${c.id}`, `Cost: ${c.label}`, c.perParticipant),
      start: c.startYear,
      years: c.years,
      payer: c.payer,
    })),
    effects: s.effects.map((e) => ({
      size: add(`effect:${e.id}`, `Effect: ${e.label}`, e.perParticipant),
      decay: add(`decay:${e.id}`, `Decay: ${e.label}`, e.decay),
      start: e.startYear,
      years: e.years,
      values: e.values.map((v, j) => ({
        perspective: v.perspective,
        perUnit: add(`value:${e.id}:${j}`, `Value: ${e.label}, ${v.label}`, v.perUnit),
      })),
    })),
  };
}

export interface Flows {
  benefits: Record<Perspective, Float64Array>;
  costs: Record<Perspective, Float64Array>;
}

export interface Evaluation {
  npv: number;
  benefits: number; // PV, including deadweight savings on taxpayer benefits
  costs: number; // PV, including deadweight cost on taxpayer costs
  byPerspective: Record<Perspective | "deadweight", number>;
  discounted: Float64Array;
  nominal: Float64Array;
  byYear: Record<Perspective | "deadweight", Float64Array>;
}

export function evaluate(s: Scenario, p: Plan, values: ArrayLike<number>): Evaluation {
  const h = s.horizon;
  const rate = values[p.discountRate];
  const dwl = values[p.deadweight];
  const impl = values[p.implementation];
  const byYear = {
    participants: new Float64Array(h),
    taxpayers: new Float64Array(h),
    others: new Float64Array(h),
    deadweight: new Float64Array(h),
  };
  let benefits = 0;
  let costs = 0;
  const factors = Float64Array.from({ length: h }, (_, t) => discount(rate, t));
  const nominal = new Float64Array(h);
  for (const c of p.costs) {
    const amount = values[c.amount] * s.participants;
    for (let t = c.start; t < Math.min(h, c.start + c.years); t++) {
      const pv = amount * factors[t];
      nominal[t] -= amount * (c.payer === "taxpayers" ? 1 + dwl : 1);
      byYear[c.payer][t] -= pv;
      costs += pv;
      if (c.payer === "taxpayers") {
        byYear.deadweight[t] -= dwl * pv;
        costs += dwl * pv;
      }
    }
  }
  for (const e of p.effects) {
    const size = values[e.size] * impl * s.participants;
    const keep = 1 - values[e.decay];
    for (const v of e.values) {
      const perUnit = values[v.perUnit];
      for (let t = e.start; t < Math.min(h, e.start + e.years); t++) {
        const flow = size * keep ** (t - e.start) * perUnit;
        const pv = flow * factors[t];
        nominal[t] += flow * (v.perspective === "taxpayers" ? 1 + dwl : 1);
        byYear[v.perspective][t] += pv;
        benefits += pv;
        if (v.perspective === "taxpayers") {
          // Taxpayer savings avoid deadweight loss; added costs (negative values) create it.
          byYear.deadweight[t] += dwl * pv;
          benefits += dwl * pv;
        }
      }
    }
  }
  const discounted = new Float64Array(h);
  const totals = { participants: 0, taxpayers: 0, others: 0, deadweight: 0 };
  for (const key of [...PERSPECTIVES, "deadweight"] as const) {
    for (let t = 0; t < h; t++) {
      discounted[t] += byYear[key][t];
      totals[key] += byYear[key][t];
    }
  }
  return { npv: benefits - costs, benefits, costs, byPerspective: totals, discounted, nominal, byYear };
}

export interface Summary {
  mean: number;
  sd: number;
  mcse: number;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface TornadoBar {
  id: string;
  label: string;
  description: string;
  lowInput: number;
  highInput: number;
  lowNpv: number;
  highNpv: number;
  swing: number;
}

export interface Result {
  draws: number;
  seed: number;
  npv: Float64Array;
  npvSummary: Summary;
  probPositive: number;
  probPositiveSe: number;
  benefits: number;
  costs: number;
  bcr: number;
  bcrInterval: [number, number];
  perParticipant: number;
  byPerspective: Record<Perspective | "deadweight", number>;
  byYear: Record<Perspective | "deadweight", Float64Array>;
  irr: number;
  payback: number | null;
  histogram: Bin[];
  tornado: TornadoBar[];
  correlations: { id: string; label: string; rho: number }[];
  baseNpv: number;
}

export class ScenarioError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("; "));
  }
}

function summarize(xs: Float64Array): Summary {
  const s = sorted(xs);
  const q = (p: number) => quantileSorted(s, p);
  const m = mean(xs);
  const d = sd(xs);
  return {
    mean: m,
    sd: d,
    mcse: d / Math.sqrt(xs.length),
    p5: q(0.05),
    p10: q(0.1),
    p25: q(0.25),
    p50: q(0.5),
    p75: q(0.75),
    p90: q(0.9),
    p95: q(0.95),
  };
}

// Each draw samples every input once, so an input holds the same value in every year.
export function simulate(s: Scenario, draws = 10_000, seed = 1): Result {
  const errors = validate(s);
  if (!Number.isInteger(draws) || draws < 100 || draws > 1_000_000) errors.push("draws must be a whole number from 100 to 1,000,000");
  if (errors.length) throw new ScenarioError(errors);
  const p = plan(s);
  const k = p.inputs.length;
  const rng = new Rng(seed);
  const inputDraws = p.inputs.map(() => new Float64Array(draws));
  const npv = new Float64Array(draws);
  const ben = new Float64Array(draws);
  const cost = new Float64Array(draws);
  const h = s.horizon;
  const byYear = {
    participants: new Float64Array(h),
    taxpayers: new Float64Array(h),
    others: new Float64Array(h),
    deadweight: new Float64Array(h),
  };
  const byPerspective = { participants: 0, taxpayers: 0, others: 0, deadweight: 0 };
  const nominal = new Float64Array(h);
  const values = new Float64Array(k);
  for (let i = 0; i < draws; i++) {
    for (let j = 0; j < k; j++) {
      values[j] = sample(p.inputs[j].dist, rng);
      inputDraws[j][i] = values[j];
    }
    const r = evaluate(s, p, values);
    npv[i] = r.npv;
    ben[i] = r.benefits;
    cost[i] = r.costs;
    for (let t = 0; t < h; t++) nominal[t] += r.nominal[t] / draws;
    for (const key of [...PERSPECTIVES, "deadweight"] as const) {
      byPerspective[key] += r.byPerspective[key] / draws;
      for (let t = 0; t < h; t++) byYear[key][t] += r.byYear[key][t] / draws;
    }
  }

  const net = new Float64Array(h);
  for (const key of [...PERSPECTIVES, "deadweight"] as const) for (let t = 0; t < h; t++) net[t] += byYear[key][t];
  const medianValues = Float64Array.from(inputDraws, (xs) => quantileSorted(sorted(xs), 0.5));

  const ratios = Float64Array.from(ben, (b, i) => (cost[i] > 0 ? b / cost[i] : Number.NaN)).filter(Number.isFinite);
  const sortedRatios = sorted(ratios);
  let positive = 0;
  for (let i = 0; i < draws; i++) if (npv[i] > 0) positive++;
  const probPositive = positive / draws;
  const benefits = mean(ben);
  const costs = mean(cost);

  const base = evaluate(s, p, medianValues).npv;
  const tornado: TornadoBar[] = [];
  const correlations: Result["correlations"] = [];
  for (let j = 0; j < k; j++) {
    const input = p.inputs[j];
    if (!isUncertain(input.dist)) continue;
    const xs = sorted(inputDraws[j]);
    const lowInput = quantileSorted(xs, 0.1);
    const highInput = quantileSorted(xs, 0.9);
    const v = Float64Array.from(medianValues);
    v[j] = lowInput;
    const lowNpv = evaluate(s, p, v).npv;
    v[j] = highInput;
    const highNpv = evaluate(s, p, v).npv;
    tornado.push({
      id: input.id,
      label: input.label,
      description: describe(input.dist),
      lowInput,
      highInput,
      lowNpv,
      highNpv,
      swing: Math.abs(highNpv - lowNpv),
    });
    correlations.push({ id: input.id, label: input.label, rho: spearman(inputDraws[j], npv) });
  }
  tornado.sort((a, b) => b.swing - a.swing);
  correlations.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));

  return {
    draws,
    seed,
    npv,
    npvSummary: summarize(npv),
    probPositive,
    probPositiveSe: Math.sqrt((probPositive * (1 - probPositive)) / draws),
    benefits,
    costs,
    bcr: costs > 0 ? benefits / costs : Number.NaN,
    bcrInterval: [quantileSorted(sortedRatios, 0.05), quantileSorted(sortedRatios, 0.95)],
    perParticipant: mean(npv) / s.participants,
    byPerspective,
    byYear,
    irr: irr(nominal),
    payback: payback(net),
    histogram: histogram(npv),
    tornado,
    correlations,
    baseNpv: base,
  };
}
