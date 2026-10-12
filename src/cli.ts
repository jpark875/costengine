#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { PRESETS, type Result, type Scenario, ScenarioError, simulate } from "./engine/index.js";

const USAGE = `usage:
  costengine run <scenario.json | preset name> [--draws N] [--seed N] [--json]
  costengine presets            list the example scenarios
  costengine show <preset>      print an example scenario as JSON`;

const money = (x: number) => `${x < 0 ? "-" : ""}$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;
const pct = (x: number, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "n/a");

function load(source: string): Scenario {
  const preset = PRESETS.find((p) => p.name.toLowerCase() === source.toLowerCase());
  if (preset) return preset;
  return JSON.parse(readFileSync(source, "utf8")) as Scenario;
}

function option(args: string[], name: string, fallback: number): number {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = Number(args[i + 1]);
  if (!Number.isFinite(value)) throw new Error(`${name} needs a number`);
  return value;
}

export function report(s: Scenario, r: Result): string {
  const m = r.npvSummary;
  const lines = [
    `${s.name}: ${s.participants.toLocaleString("en-US")} participants, ${s.horizon} years, ${s.dollarYear} dollars`,
    `${r.draws.toLocaleString("en-US")} draws, seed ${r.seed}`,
    "",
    `  expected net present value   ${money(m.mean)}  (simulation error ±${money(1.96 * m.mcse)})`,
    `  90% of draws between         ${money(m.p5)} and ${money(m.p95)}`,
    `  benefit per $1 of cost       $${r.bcr.toFixed(2)}`,
    `  chance benefits exceed costs ${pct(r.probPositive)}`,
    `  internal rate of return      ${pct(r.irr)}`,
    `  payback                      ${r.payback === null ? "not within the window" : `year ${r.payback}`}`,
    "",
    "  by perspective (expected present value)",
    `    participants               ${money(r.byPerspective.participants)}`,
    `    taxpayers                  ${money(r.byPerspective.taxpayers)}`,
    `    others                     ${money(r.byPerspective.others)}`,
    `    deadweight cost            ${money(r.byPerspective.deadweight)}`,
    "",
    "  inputs that move the result most (NPV at the input's 10th / 90th percentile)",
    ...r.tornado.slice(0, 5).map((b) => `    ${b.label.padEnd(44)} ${money(b.lowNpv)} / ${money(b.highNpv)}`),
  ];
  return lines.join("\n");
}

export function main(argv: string[]): number {
  const [command, target, ...rest] = argv;
  try {
    if (command === "presets") {
      for (const p of PRESETS) console.log(`${p.name.padEnd(18)} ${p.description}`);
      return 0;
    }
    if (command === "show" && target) {
      const preset = PRESETS.find((p) => p.name.toLowerCase() === target.toLowerCase());
      if (!preset) throw new Error(`no preset named ${target}`);
      console.log(JSON.stringify(preset, null, 2));
      return 0;
    }
    if (command === "run" && target) {
      const s = load(target);
      const r = simulate(s, option(rest, "--draws", 10_000), option(rest, "--seed", 1));
      if (rest.includes("--json")) {
        const { npv: _npv, ...summary } = r;
        console.log(JSON.stringify({ ...summary, byYear: Object.fromEntries(Object.entries(r.byYear).map(([k, v]) => [k, Array.from(v)])) }, null, 2));
      } else {
        console.log(report(s, r));
      }
      return 0;
    }
    console.error(USAGE);
    return 2;
  } catch (error) {
    const message = error instanceof ScenarioError ? error.problems.join("\n  ") : (error as Error).message;
    console.error(`error: ${message}`);
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
