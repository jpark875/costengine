import { describe, expect, test } from "vitest";
import { PRESETS, simulate, validate } from "../src/engine";
import { flowsChart, histogramChart, tornadoChart } from "../src/ui/charts";
import { convert } from "../src/ui/form";
import { esc, money, pct, ratio } from "../src/ui/format";
import { decode, encode, looksLikeScenario } from "../src/ui/share";

describe("share links", () => {
  test("round-trip every preset, including non-ASCII names", () => {
    for (const p of PRESETS) expect(decode(encode(p))).toEqual(p);
    const named = { ...PRESETS[0], name: "Programa de formación — 2025" };
    expect(decode(encode(named))?.name).toBe(named.name);
  });

  test("reject anything that is not a scenario", () => {
    expect(decode("not base64!")).toBeNull();
    expect(decode(btoa(JSON.stringify({ name: "x" })))).toBeNull();
    expect(looksLikeScenario(null)).toBe(false);
    expect(looksLikeScenario({ ...PRESETS[0], costs: [{}] })).toBe(false);
  });
});

describe("distribution conversion keeps inputs valid", () => {
  test.each(["fixed", "normal", "lognormal", "uniform", "triangular", "pert"] as const)("to %s", (kind) => {
    for (const p of PRESETS) {
      const s = structuredClone(p);
      s.costs = s.costs.map((c) => ({ ...c, perParticipant: convert(c.perParticipant, kind) }));
      expect(validate(s)).toEqual([]);
    }
  });
});

describe("formatting", () => {
  test("money, percent and ratio", () => {
    expect(money(1_234_567)).toBe("$1.2M");
    expect(money(-350_000)).toBe("−$350.0K");
    expect(money(12)).toBe("$12");
    expect(pct(0.456)).toBe("46%");
    expect(ratio(Number.NaN)).toBe("–");
    expect(esc(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });
});

describe("charts", () => {
  test("render for every preset and escape user labels", () => {
    for (const p of PRESETS) {
      const s = structuredClone(p);
      s.costs[0].label = '<img src=x onerror="alert(1)">';
      const r = simulate(s, 1000, 1);
      const svg = histogramChart(r.histogram, r.draws) + tornadoChart(r.tornado, r.baseNpv) + flowsChart(r);
      expect(svg).not.toContain("<img");
      expect(svg.match(/<svg/g)).toHaveLength(3);
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
  });
});
