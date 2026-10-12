import { type Dist, lowerBound, problems, upperBound } from "./distributions.js";

export const PERSPECTIVES = ["participants", "taxpayers", "others"] as const;
export type Perspective = (typeof PERSPECTIVES)[number];

export interface CostItem {
  id: string;
  label: string;
  perParticipant: Dist;
  startYear: number;
  years: number;
  payer: Perspective;
}

export interface Value {
  perspective: Perspective;
  label: string;
  perUnit: Dist;
}

export interface Effect {
  id: string;
  label: string;
  unit: string;
  perParticipant: Dist;
  startYear: number;
  years: number;
  decay: Dist;
  values: Value[];
}

export interface Scenario {
  name: string;
  description: string;
  dollarYear: number;
  participants: number;
  horizon: number;
  discountRate: Dist;
  /** Per dollar of net taxpayer spending or saving. */
  deadweight: Dist;
  /** Share of the evaluated effect that survives at scale. */
  implementation: Dist;
  costs: CostItem[];
  effects: Effect[];
}

export const LIMITS = { horizon: 100, participants: 1e9, items: 50 } as const;

export function validate(s: Scenario): string[] {
  const out: string[] = [];
  const int = (v: number) => Number.isInteger(v);
  if (!(s.participants > 0) || s.participants > LIMITS.participants)
    out.push(`participants must be between 1 and ${LIMITS.participants.toLocaleString("en-US")}`);
  if (!int(s.horizon) || s.horizon < 1 || s.horizon > LIMITS.horizon)
    out.push(`horizon must be a whole number of years from 1 to ${LIMITS.horizon}`);
  out.push(...problems(s.discountRate, "discount rate"));
  out.push(...problems(s.deadweight, "deadweight cost"));
  out.push(...problems(s.implementation, "implementation factor"));
  if (lowerBound(s.discountRate) <= -1) out.push("the discount rate must stay above −100%");
  const decayed = s.effects.filter((e) => lowerBound(e.decay) < 0 || upperBound(e.decay) > 1);
  for (const e of decayed) out.push(`effect "${e.label || e.id}": decay must stay between 0 and 1`);
  if (s.costs.length === 0) out.push("add at least one cost");
  if (s.costs.length > LIMITS.items || s.effects.length > LIMITS.items)
    out.push(`at most ${LIMITS.items} costs and ${LIMITS.items} effects`);
  const ids = new Set<string>();
  const unique = (id: string, what: string) => {
    if (ids.has(id)) out.push(`${what} id "${id}" is used twice`);
    ids.add(id);
  };
  for (const c of s.costs) {
    unique(c.id, "cost");
    const name = `cost "${c.label || c.id}"`;
    out.push(...problems(c.perParticipant, name));
    if (!int(c.startYear) || c.startYear < 0) out.push(`${name}: start year must be a whole number ≥ 0`);
    if (!int(c.years) || c.years < 1) out.push(`${name}: must last at least one year`);
    if (!PERSPECTIVES.includes(c.payer)) out.push(`${name}: unknown payer`);
  }
  for (const e of s.effects) {
    unique(e.id, "effect");
    const name = `effect "${e.label || e.id}"`;
    out.push(...problems(e.perParticipant, name));
    out.push(...problems(e.decay, `${name} decay`));
    if (!int(e.startYear) || e.startYear < 0) out.push(`${name}: start year must be a whole number ≥ 0`);
    if (!int(e.years) || e.years < 1) out.push(`${name}: must last at least one year`);
    if (e.values.length === 0) out.push(`${name}: needs at least one dollar value`);
    for (const v of e.values) {
      out.push(...problems(v.perUnit, `${name} value "${v.label}"`));
      if (!PERSPECTIVES.includes(v.perspective)) out.push(`${name}: unknown perspective`);
    }
  }
  return out;
}
