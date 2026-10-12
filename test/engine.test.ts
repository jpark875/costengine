import { describe, expect, test } from "vitest";
import {
  type Dist,
  type Scenario,
  PRESETS,
  Rng,
  ScenarioError,
  distMean,
  evaluate,
  histogram,
  irr,
  payback,
  plan,
  presentValue,
  problems,
  quantile,
  ranks,
  sample,
  sd,
  simulate,
  spearman,
  validate,
} from "../src/engine";

const fixed = (value: number): Dist => ({ kind: "fixed", value });

function scenario(over: Partial<Scenario> = {}): Scenario {
  return {
    name: "test",
    description: "",
    dollarYear: 2025,
    participants: 100,
    horizon: 10,
    discountRate: fixed(0.03),
    deadweight: fixed(0),
    implementation: fixed(1),
    costs: [{ id: "c", label: "Cost", perParticipant: fixed(1000), startYear: 0, years: 1, payer: "taxpayers" }],
    effects: [
      {
        id: "e",
        label: "Effect",
        unit: "unit",
        perParticipant: fixed(0.1),
        startYear: 1,
        years: 5,
        decay: fixed(0),
        values: [{ perspective: "participants", label: "Value", perUnit: fixed(2000) }],
      },
    ],
    ...over,
  };
}

describe("random numbers", () => {
  test("are reproducible from a seed and differ across seeds", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  test("uniforms are uniform", () => {
    const rng = new Rng(1);
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) counts[Math.floor(rng.next() * 10)]++;
    const chi2 = counts.reduce((s, c) => s + (c - 10_000) ** 2 / 10_000, 0);
    expect(chi2).toBeLessThan(27.9); // 99.9th percentile of chi-square(9)
  });
});

describe("distributions", () => {
  const cases: [Dist, number, number][] = [
    [{ kind: "normal", mean: 5, sd: 2 }, 5, 2],
    [{ kind: "lognormal", mean: 10, sd: 4 }, 10, 4],
    [{ kind: "uniform", min: 2, max: 8 }, 5, 6 / Math.sqrt(12)],
    [{ kind: "triangular", min: 0, mode: 1, max: 5 }, 2, Math.sqrt((0 + 1 + 25 - 0 - 0 - 5) / 18)],
    [{ kind: "pert", min: 0, mode: 2, max: 10 }, 3, Math.sqrt(((3 - 0) * (10 - 3)) / 7)],
  ];
  test.each(cases)("%o has the right mean and spread", (d, m, s) => {
    const rng = new Rng(7);
    const xs = Float64Array.from({ length: 200_000 }, () => sample(d, rng));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeCloseTo(m, 1);
    expect(sd(xs)).toBeCloseTo(s, 1);
    expect(distMean(d)).toBeCloseTo(m, 10);
  });

  test("truncated normals stay in range and degenerate cases are exact", () => {
    const rng = new Rng(3);
    const d: Dist = { kind: "normal", mean: 0, sd: 1, min: -0.5, max: 2 };
    for (let i = 0; i < 10_000; i++) {
      const x = sample(d, rng);
      expect(x).toBeGreaterThanOrEqual(-0.5);
      expect(x).toBeLessThanOrEqual(2);
    }
    expect(sample({ kind: "pert", min: 3, mode: 3, max: 3 }, rng)).toBe(3);
    expect(sample({ kind: "triangular", min: 1, mode: 1, max: 1 }, rng)).toBe(1);
    expect(sample({ kind: "lognormal", mean: 4, sd: 0 }, rng)).toBe(4);
  });

  test("bad parameters are reported", () => {
    expect(problems({ kind: "normal", mean: 0, sd: -1 }, "x")).toEqual(["x: sd must not be negative"]);
    expect(problems({ kind: "uniform", min: 3, max: 1 }, "x")).toHaveLength(1);
    expect(problems({ kind: "pert", min: 0, mode: 5, max: 1 }, "x")).toHaveLength(1);
    expect(problems({ kind: "lognormal", mean: -1, sd: 1 }, "x")).toHaveLength(1);
    expect(problems({ kind: "fixed", value: Number.NaN }, "x")).toHaveLength(1);
    expect(problems({ kind: "normal", mean: 100, sd: 1, min: 0, max: 1 }, "x")).toHaveLength(1);
  });
});

describe("finance", () => {
  test("present value of an annuity matches the closed form", () => {
    const r = 0.04;
    const flows = new Array(20).fill(100);
    const closed = 100 * (1 + r) * ((1 - (1 + r) ** -20) / r); // annuity due
    expect(presentValue(flows, r)).toBeCloseTo(closed, 8);
  });

  test("irr solves for a zero present value", () => {
    expect(irr([-100, 110])).toBeCloseTo(0.1, 8);
    expect(irr([-1000, 300, 300, 300, 300])).toBeCloseTo(0.07713847, 6);
    expect(irr([100, 100])).toBeNaN();
    expect(presentValue([-1000, 300, 300, 300, 300], irr([-1000, 300, 300, 300, 300]))).toBeCloseTo(0, 6);
  });

  test("payback is the first year cumulative net turns positive", () => {
    expect(payback([-100, 40, 40, 40])).toBe(3);
    expect(payback([-100, 10])).toBeNull();
  });
});

describe("statistics", () => {
  test("quantiles, ranks and rank correlation", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(Array.from(ranks([10, 30, 20, 30]))).toEqual([1, 3.5, 2, 3.5]);
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 12);
  });

  test("histogram bins cover every value on round edges", () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i * 1.37 - 300);
    const bins = histogram(xs, 20);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(1000);
    expect(bins[0].lo).toBeLessThanOrEqual(-300);
    expect(bins.at(-1)!.hi).toBeGreaterThanOrEqual(xs.at(-1)!);
    expect(histogram([5, 5, 5])).toEqual([{ lo: 5, hi: 5, count: 3 }]);
  });
});

describe("benefit-cost evaluation", () => {
  test("a fixed scenario matches the hand calculation", () => {
    const s = scenario();
    const r = simulate(s, 100, 1);
    const cost = 1000 * 100;
    let benefit = 0;
    for (let t = 1; t <= 5; t++) benefit += (0.1 * 100 * 2000) / 1.03 ** t;
    expect(r.costs).toBeCloseTo(cost, 6);
    expect(r.benefits).toBeCloseTo(benefit, 6);
    expect(r.npvSummary.mean).toBeCloseTo(benefit - cost, 6);
    expect(r.npvSummary.sd).toBeCloseTo(0, 6);
    expect(r.bcr).toBeCloseTo(benefit / cost, 10);
    expect(r.probPositive).toBe(benefit > cost ? 1 : 0);
    expect(r.tornado).toHaveLength(0);
    expect(r.irr).toBeCloseTo(irr([-cost, 20000, 20000, 20000, 20000, 20000]), 8);
    expect(r.perParticipant).toBeCloseTo((benefit - cost) / 100, 6);
  });

  test("decay, horizon truncation and the implementation factor", () => {
    const s = scenario({ horizon: 3, implementation: fixed(0.5) });
    s.effects[0].decay = fixed(0.5);
    const r = simulate(s, 100, 1);
    const benefit = (0.5 * 0.1 * 100 * 2000) / 1.03 + (0.5 * 0.1 * 100 * 2000 * 0.5) / 1.03 ** 2;
    expect(r.benefits).toBeCloseTo(benefit, 6);
  });

  test("deadweight loss applies to net taxpayer flows only", () => {
    const s = scenario({ deadweight: fixed(0.5) });
    s.effects[0].values.push({ perspective: "taxpayers", label: "Savings", perUnit: fixed(1000) });
    s.costs.push({ id: "p", label: "Paid by participants", perParticipant: fixed(200), startYear: 0, years: 1, payer: "participants" });
    const p = plan(s);
    const values = p.inputs.map((i) => (i.dist.kind === "fixed" ? i.dist.value : 0));
    const ev = evaluate(s, p, values);
    let taxBenefit = 0;
    for (let t = 1; t <= 5; t++) taxBenefit += (0.1 * 100 * 1000) / 1.03 ** t;
    expect(ev.byPerspective.deadweight).toBeCloseTo(0.5 * (taxBenefit - 100_000), 6);
    let earned = 0;
    for (let t = 1; t <= 5; t++) earned += (0.1 * 100 * 2000) / 1.03 ** t;
    expect(ev.byPerspective.participants).toBeCloseTo(earned - 20_000, 6);
    expect(ev.costs).toBeCloseTo(100_000 * 1.5 + 20_000, 6);
    const sum = ev.byPerspective.participants + ev.byPerspective.taxpayers + ev.byPerspective.others + ev.byPerspective.deadweight;
    expect(sum).toBeCloseTo(ev.npv, 6);
  });

  test("monte carlo is reproducible, converges, and reports its own error", () => {
    const s = PRESETS[1];
    const a = simulate(s, 2000, 9);
    const b = simulate(s, 2000, 9);
    expect(Array.from(a.npv)).toEqual(Array.from(b.npv));
    const big = simulate(s, 40_000, 10);
    expect(Math.abs(a.npvSummary.mean - big.npvSummary.mean)).toBeLessThan(4 * a.npvSummary.mcse);
    expect(big.npvSummary.mcse).toBeLessThan(a.npvSummary.mcse / 3);
    expect(a.npvSummary.p5).toBeLessThan(a.npvSummary.p50);
    expect(a.npvSummary.p50).toBeLessThan(a.npvSummary.p95);
    expect(a.bcrInterval[0]).toBeLessThan(a.bcr);
    expect(a.bcr).toBeLessThan(a.bcrInterval[1]);
  });

  test("perspective totals add up to the expected NPV", () => {
    for (const s of PRESETS) {
      const r = simulate(s, 2000, 2);
      const total = Object.values(r.byPerspective).reduce((x, y) => x + y, 0);
      expect(total).toBeCloseTo(r.npvSummary.mean, 4);
      let byYear = 0;
      for (const series of Object.values(r.byYear)) for (const v of series) byYear += v;
      expect(byYear).toBeCloseTo(r.npvSummary.mean, 4);
    }
  });

  test("the tornado puts the dominant input first", () => {
    const s = scenario({ discountRate: { kind: "uniform", min: 0.029, max: 0.031 } });
    s.effects[0].perParticipant = { kind: "uniform", min: 0, max: 0.2 };
    const r = simulate(s, 2000, 4);
    expect(r.tornado[0].id).toBe("effect:e");
    expect(r.tornado[0].highNpv).toBeGreaterThan(r.tornado[0].lowNpv);
    expect(r.correlations[0].rho).toBeGreaterThan(0.99);
    expect(r.tornado.at(-1)!.id).toBe("discountRate");
  });

  test("invalid scenarios are refused with every problem listed", () => {
    const s = scenario({ participants: 0, horizon: 0, costs: [] });
    s.effects[0].values = [];
    s.effects[0].decay = fixed(1.5);
    const found = validate(s);
    expect(found.length).toBeGreaterThanOrEqual(5);
    expect(() => simulate(s)).toThrow(ScenarioError);
    expect(() => simulate(scenario(), 10)).toThrow(/draws/);
    const dup = scenario();
    dup.costs.push({ ...dup.costs[0] });
    expect(validate(dup).some((m) => m.includes("twice"))).toBe(true);
    expect(validate(scenario({ discountRate: fixed(-1) }))).toHaveLength(1);
  });

  test("presets are valid", () => {
    for (const s of PRESETS) expect(validate(s)).toEqual([]);
  });
});
