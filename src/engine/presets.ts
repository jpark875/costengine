import type { Scenario } from "./scenario.js";

/**
 * Illustrative scenarios. The numbers are plausible orders of magnitude chosen to show how
 * the engine behaves, not estimates for any real program; replace them with your own.
 */
const ASSUMPTIONS = {
  discountRate: { kind: "triangular", min: 0.02, mode: 0.03, max: 0.05 },
  deadweight: { kind: "triangular", min: 0, mode: 0.5, max: 1 },
  implementation: { kind: "pert", min: 0.5, mode: 0.75, max: 1 },
} as const satisfies Pick<Scenario, "discountRate" | "deadweight" | "implementation">;

export const PRESETS: Scenario[] = [
  {
    name: "Job training",
    description: "Six months of sector-based training; earnings gains fade over a decade.",
    dollarYear: 2025,
    participants: 500,
    horizon: 15,
    ...ASSUMPTIONS,
    costs: [
      { id: "program", label: "Training", perParticipant: { kind: "normal", mean: 6000, sd: 800, min: 0 }, startYear: 0, years: 1, payer: "taxpayers" },
      { id: "forgone", label: "Forgone earnings", perParticipant: { kind: "uniform", min: 2000, max: 5000 }, startYear: 0, years: 1, payer: "participants" },
    ],
    effects: [
      {
        id: "employment",
        label: "Employment",
        unit: "change in probability of working",
        perParticipant: { kind: "normal", mean: 0.05, sd: 0.02 },
        startYear: 1,
        years: 10,
        decay: { kind: "pert", min: 0.05, mode: 0.1, max: 0.2 },
        values: [
          { perspective: "participants", label: "Earnings after tax", perUnit: { kind: "normal", mean: 24000, sd: 3000, min: 0 } },
          { perspective: "taxpayers", label: "Taxes and lower benefit payments", perUnit: { kind: "normal", mean: 6000, sd: 1500, min: 0 } },
        ],
      },
    ],
  },
  {
    name: "Reentry services",
    description: "Case management for people leaving prison, reducing reconvictions for five years.",
    dollarYear: 2025,
    participants: 1000,
    horizon: 10,
    ...ASSUMPTIONS,
    costs: [
      { id: "program", label: "Case management", perParticipant: { kind: "triangular", min: 3500, mode: 4500, max: 6000 }, startYear: 0, years: 1, payer: "taxpayers" },
    ],
    effects: [
      {
        id: "reconvictions",
        label: "Reconvictions avoided",
        unit: "convictions per person per year",
        perParticipant: { kind: "normal", mean: 0.03, sd: 0.015 },
        startYear: 0,
        years: 5,
        decay: { kind: "uniform", min: 0.1, max: 0.3 },
        values: [
          { perspective: "taxpayers", label: "Courts, prison and supervision", perUnit: { kind: "normal", mean: 25000, sd: 5000, min: 0 } },
          { perspective: "others", label: "Harm to victims", perUnit: { kind: "lognormal", mean: 60000, sd: 30000 } },
        ],
      },
    ],
  },
  {
    name: "Home visiting",
    description: "Two years of nurse visits for first-time parents, with child and parent outcomes.",
    dollarYear: 2025,
    participants: 300,
    horizon: 20,
    ...ASSUMPTIONS,
    costs: [
      { id: "visits", label: "Nurse visits", perParticipant: { kind: "normal", mean: 4500, sd: 500, min: 0 }, startYear: 0, years: 2, payer: "taxpayers" },
    ],
    effects: [
      {
        id: "maltreatment",
        label: "Maltreatment cases avoided",
        unit: "substantiated cases per family per year",
        perParticipant: { kind: "normal", mean: 0.04, sd: 0.015 },
        startYear: 0,
        years: 6,
        decay: { kind: "fixed", value: 0 },
        values: [
          { perspective: "taxpayers", label: "Child welfare and medical costs", perUnit: { kind: "normal", mean: 20000, sd: 6000, min: 0 } },
          { perspective: "others", label: "Long-run harm to the child", perUnit: { kind: "lognormal", mean: 40000, sd: 25000 } },
        ],
      },
      {
        id: "work",
        label: "Parent employment",
        unit: "change in probability of working",
        perParticipant: { kind: "normal", mean: 0.03, sd: 0.02 },
        startYear: 2,
        years: 13,
        decay: { kind: "pert", min: 0, mode: 0.05, max: 0.15 },
        values: [
          { perspective: "participants", label: "Earnings after tax", perUnit: { kind: "normal", mean: 20000, sd: 3000, min: 0 } },
          { perspective: "taxpayers", label: "Taxes and lower benefit payments", perUnit: { kind: "normal", mean: 5000, sd: 1500, min: 0 } },
        ],
      },
    ],
  },
];
