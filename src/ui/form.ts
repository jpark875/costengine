import { DIST_KINDS, type Dist, PERSPECTIVES, type Perspective, type Scenario } from "../engine";

export interface Settings {
  draws: number;
  seed: number;
}

type Change = (structural: boolean) => void;

const PERSPECTIVE_LABELS: Record<Perspective, string> = {
  participants: "Participants",
  taxpayers: "Taxpayers",
  others: "Others in society",
};

const KIND_LABELS: Record<Dist["kind"], string> = {
  fixed: "Fixed",
  normal: "Normal",
  lognormal: "Lognormal",
  uniform: "Uniform",
  triangular: "Triangular",
  pert: "PERT",
};

const PARAMS: Record<Dist["kind"], string[]> = {
  fixed: ["value"],
  normal: ["mean", "sd", "min", "max"],
  lognormal: ["mean", "sd"],
  uniform: ["min", "max"],
  triangular: ["min", "mode", "max"],
  pert: ["min", "mode", "max"],
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${++uid}`;

function numberInput(value: number | undefined, onInput: (v: number | undefined) => void, opts: { optional?: boolean; step?: string } = {}): HTMLInputElement {
  const input = el("input", { type: "number", step: opts.step ?? "any", inputmode: "decimal" });
  input.value = value === undefined ? "" : String(value);
  if (opts.optional) input.placeholder = "none";
  input.addEventListener("input", () => {
    if (input.value.trim() === "" && opts.optional) return onInput(undefined);
    onInput(input.value.trim() === "" ? Number.NaN : Number(input.value));
  });
  return input;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const wrap = el("label", { class: "field" });
  wrap.append(el("span", {}, label), control);
  return wrap;
}

/** Convert a distribution to another kind, keeping its center and spread where possible. */
export function convert(d: Dist, kind: Dist["kind"]): Dist {
  const center = d.kind === "fixed" ? d.value : "mean" in d ? d.mean : "mode" in d ? d.mode : (d.min + d.max) / 2;
  const spread =
    d.kind === "fixed" ? Math.abs(center) * 0.2 : "sd" in d ? d.sd : (d.max - d.min) / 4;
  const s = spread || Math.abs(center) * 0.2 || 1;
  switch (kind) {
    case "fixed":
      return { kind, value: center };
    case "normal":
      return { kind, mean: center, sd: s };
    case "lognormal":
      return { kind, mean: center > 0 ? center : 1, sd: s };
    case "uniform":
      return { kind, min: center - 2 * s, max: center + 2 * s };
    case "triangular":
    case "pert":
      return { kind, min: center - 2 * s, mode: center, max: center + 2 * s };
  }
}

function distEditor(get: () => Dist, set: (d: Dist) => void, onChange: Change): HTMLElement {
  const wrap = el("div", { class: "dist" });
  const d = get();
  const kindLabel = el("label", {}, "shape");
  const select = el("select");
  for (const k of DIST_KINDS) {
    const option = el("option", { value: k }, KIND_LABELS[k]);
    if (k === d.kind) option.selected = true;
    select.append(option);
  }
  select.addEventListener("change", () => {
    set(convert(get(), select.value as Dist["kind"]));
    onChange(true);
  });
  kindLabel.append(select);
  wrap.append(kindLabel);
  for (const name of PARAMS[d.kind]) {
    const optional = d.kind === "normal" && (name === "min" || name === "max");
    const label = el("label", {}, optional ? `${name} (opt.)` : name);
    const current = (d as Record<string, unknown>)[name] as number | undefined;
    label.append(
      numberInput(
        current,
        (v) => {
          const target = get() as Record<string, unknown>;
          if (v === undefined) delete target[name];
          else target[name] = v;
          onChange(false);
        },
        { optional },
      ),
    );
    wrap.append(label);
  }
  return wrap;
}

function perspectiveSelect(value: Perspective, onSelect: (p: Perspective) => void): HTMLSelectElement {
  const select = el("select");
  for (const p of PERSPECTIVES) {
    const option = el("option", { value: p }, PERSPECTIVE_LABELS[p]);
    if (p === value) option.selected = true;
    select.append(option);
  }
  select.addEventListener("change", () => onSelect(select.value as Perspective));
  return select;
}

function textInput(value: string, onInput: (v: string) => void, attrs: Record<string, string> = {}): HTMLInputElement {
  const input = el("input", { type: "text", ...attrs });
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

function removeButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el("button", { type: "button", "aria-label": label }, "Remove");
  button.addEventListener("click", onClick);
  return button;
}

/** Build the whole form for ``s``. Value edits mutate ``s`` in place; structural ones rebuild. */
export function renderForm(root: HTMLElement, s: Scenario, settings: Settings, onChange: Change): void {
  root.replaceChildren();
  const program = el("fieldset");
  program.append(el("legend", {}, "Program"));
  program.append(field("Name", textInput(s.name, (v) => ((s.name = v), onChange(false)))));
  program.append(field("Participants", numberInput(s.participants, (v) => ((s.participants = v ?? Number.NaN), onChange(false)), { step: "1" })));
  program.append(field("Years evaluated", numberInput(s.horizon, (v) => ((s.horizon = v ?? Number.NaN), onChange(false)), { step: "1" })));
  program.append(field("Dollar year", numberInput(s.dollarYear, (v) => ((s.dollarYear = v ?? Number.NaN), onChange(false)), { step: "1" })));
  root.append(program);

  const costs = el("fieldset");
  costs.append(el("legend", {}, "Costs per participant per year"));
  s.costs.forEach((c, i) => {
    const card = el("div", { class: "card" });
    const head = el("div", { class: "head" });
    head.append(textInput(c.label, (v) => ((c.label = v), onChange(false)), { "aria-label": "Cost name" }));
    head.append(removeButton(`Remove cost ${c.label}`, () => (s.costs.splice(i, 1), onChange(true))));
    card.append(head);
    card.append(field("Paid by", perspectiveSelect(c.payer, (p) => ((c.payer = p), onChange(false)))));
    card.append(field("First year", numberInput(c.startYear, (v) => ((c.startYear = v ?? Number.NaN), onChange(false)), { step: "1" })));
    card.append(field("Years", numberInput(c.years, (v) => ((c.years = v ?? Number.NaN), onChange(false)), { step: "1" })));
    card.append(distEditor(() => c.perParticipant, (d) => (c.perParticipant = d), onChange));
    costs.append(card);
  });
  const addCost = el("button", { type: "button" }, "Add cost");
  addCost.addEventListener("click", () => {
    s.costs.push({ id: nextId("cost"), label: "New cost", perParticipant: { kind: "fixed", value: 1000 }, startYear: 0, years: 1, payer: "taxpayers" });
    onChange(true);
  });
  costs.append(addCost);
  root.append(costs);

  const effects = el("fieldset");
  effects.append(el("legend", {}, "Effects and what they are worth"));
  s.effects.forEach((e, i) => {
    const card = el("div", { class: "card" });
    const head = el("div", { class: "head" });
    head.append(textInput(e.label, (v) => ((e.label = v), onChange(false)), { "aria-label": "Effect name" }));
    head.append(removeButton(`Remove effect ${e.label}`, () => (s.effects.splice(i, 1), onChange(true))));
    card.append(head);
    card.append(field("Measured as", textInput(e.unit, (v) => ((e.unit = v), onChange(false)))));
    card.append(field("First year", numberInput(e.startYear, (v) => ((e.startYear = v ?? Number.NaN), onChange(false)), { step: "1" })));
    card.append(field("Years", numberInput(e.years, (v) => ((e.years = v ?? Number.NaN), onChange(false)), { step: "1" })));
    card.append(el("div", { class: "note-text" }, "Change per participant per year"));
    card.append(distEditor(() => e.perParticipant, (d) => (e.perParticipant = d), onChange));
    card.append(el("div", { class: "note-text" }, "Share of the effect lost each year (0 to 1)"));
    card.append(distEditor(() => e.decay, (d) => (e.decay = d), onChange));
    e.values.forEach((v, j) => {
      const sub = el("div", { class: "sub" });
      const row = el("div", { class: "row" });
      row.append(textInput(v.label, (t) => ((v.label = t), onChange(false)), { "aria-label": "Value name" }));
      row.append(removeButton(`Remove value ${v.label}`, () => (e.values.splice(j, 1), onChange(true))));
      sub.append(row);
      sub.append(field("Goes to", perspectiveSelect(v.perspective, (p) => ((v.perspective = p), onChange(false)))));
      sub.append(el("div", { class: "note-text" }, "Dollars per unit of the effect per year"));
      sub.append(distEditor(() => v.perUnit, (d) => (v.perUnit = d), onChange));
      card.append(sub);
    });
    const addValue = el("button", { type: "button" }, "Add value");
    addValue.addEventListener("click", () => {
      e.values.push({ perspective: "others", label: "New value", perUnit: { kind: "fixed", value: 1000 } });
      onChange(true);
    });
    card.append(addValue);
    effects.append(card);
  });
  const addEffect = el("button", { type: "button" }, "Add effect");
  addEffect.addEventListener("click", () => {
    s.effects.push({
      id: nextId("effect"),
      label: "New effect",
      unit: "units per participant",
      perParticipant: { kind: "normal", mean: 0.05, sd: 0.02 },
      startYear: 0,
      years: 5,
      decay: { kind: "fixed", value: 0 },
      values: [{ perspective: "participants", label: "Value", perUnit: { kind: "fixed", value: 1000 } }],
    });
    onChange(true);
  });
  effects.append(addEffect);
  root.append(effects);

  const assumptions = el("fieldset");
  assumptions.append(el("legend", {}, "Economic assumptions"));
  assumptions.append(el("div", { class: "note-text" }, "Real discount rate (0.03 = 3% a year)"));
  assumptions.append(distEditor(() => s.discountRate, (d) => (s.discountRate = d), onChange));
  assumptions.append(el("div", { class: "note-text" }, "Deadweight cost per net taxpayer dollar"));
  assumptions.append(distEditor(() => s.deadweight, (d) => (s.deadweight = d), onChange));
  assumptions.append(el("div", { class: "note-text" }, "Share of the measured effect that survives at scale"));
  assumptions.append(distEditor(() => s.implementation, (d) => (s.implementation = d), onChange));
  root.append(assumptions);

  const sim = el("fieldset");
  sim.append(el("legend", {}, "Simulation"));
  const draws = el("select");
  for (const n of [1000, 10_000, 50_000]) {
    const option = el("option", { value: String(n) }, `${n.toLocaleString("en-US")} draws`);
    if (n === settings.draws) option.selected = true;
    draws.append(option);
  }
  draws.addEventListener("change", () => ((settings.draws = Number(draws.value)), onChange(false)));
  sim.append(field("Draws", draws));
  sim.append(field("Random seed", numberInput(settings.seed, (v) => ((settings.seed = Math.trunc(v ?? 1)), onChange(false)), { step: "1" })));
  root.append(sim);
}
