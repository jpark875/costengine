import "./style.css";
import { PRESETS, type Result, type Scenario } from "../engine";
import { FLOW_LEGEND, flowsChart, histogramChart, tornadoChart } from "./charts";
import { renderForm, type Settings } from "./form";
import { dollars, esc, money, num, pct, ratio } from "./format";
import { decode, encode, looksLikeScenario } from "./share";

const form = document.getElementById("inputs") as HTMLFormElement;
const results = document.getElementById("results") as HTMLDivElement;
const presets = document.getElementById("presets") as HTMLDivElement;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const fromHash = new URLSearchParams(location.hash.slice(1));
let scenario: Scenario = (fromHash.get("s") && decode(fromHash.get("s")!)) || clone(PRESETS[0]);
const settings: Settings = {
  draws: Number(fromHash.get("n")) || 10_000,
  seed: Number(fromHash.get("seed")) || 1,
};
let activePreset = PRESETS.findIndex((p) => p.name === scenario.name && JSON.stringify(p) === JSON.stringify(scenario));
let latest: Result | null = null;

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
let requestId = 0;
let timer: number | undefined;

worker.onmessage = (event: MessageEvent<{ id: number; result?: Result; problems?: string[] }>) => {
  if (event.data.id !== requestId) return; // a newer request is on its way
  results.classList.remove("busy");
  if (event.data.problems) {
    renderProblems(event.data.problems);
    return;
  }
  latest = event.data.result!;
  renderResults(latest);
};

function run(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    requestId += 1;
    results.classList.add("busy");
    worker.postMessage({ id: requestId, scenario, draws: settings.draws, seed: settings.seed });
    const hash = new URLSearchParams({ s: encode(scenario), n: String(settings.draws), seed: String(settings.seed) });
    history.replaceState(null, "", `#${hash.toString()}`);
  }, 200);
}

function onChange(structural: boolean): void {
  if (activePreset >= 0) {
    activePreset = -1;
    renderPresets();
  }
  if (structural) renderForm(form, scenario, settings, onChange);
  run();
}

function renderPresets(): void {
  presets.replaceChildren();
  PRESETS.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p.name;
    b.setAttribute("aria-pressed", String(i === activePreset));
    b.addEventListener("click", () => {
      scenario = clone(p);
      activePreset = i;
      renderPresets();
      renderForm(form, scenario, settings, onChange);
      run();
    });
    presets.append(b);
  });
}

function stat(label: string, value: string, note: string): string {
  return `<div class="stat"><div class="meta">${esc(label)}</div><div class="value">${esc(value)}</div><div class="muted small">${esc(note)}</div></div>`;
}

function table(headers: string[], rows: string[][], numeric: boolean[]): string {
  const head = headers.map((h, i) => `<th scope="col"${numeric[i] ? ' class="num"' : ""}>${esc(h)}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c, i) => `<td${numeric[i] ? ' class="num"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function legend(items: readonly (readonly [string, string])[]): string {
  return `<div class="legend">${items.map(([label, cls]) => `<span class="key"><span class="swatch ${cls}"></span>${esc(label)}</span>`).join("")}</div>`;
}

function headline(r: Result): string {
  const m = r.npvSummary;
  const verdict =
    r.probPositive >= 0.9 ? "very likely pays for itself" : r.probPositive >= 0.6 ? "probably pays for itself" : r.probPositive > 0.4 ? "is a coin flip" : r.probPositive > 0.1 ? "probably does not pay for itself" : "very likely does not pay for itself";
  return `In ${r.draws.toLocaleString("en-US")} simulated futures, ${scenario.name || "this program"} ${verdict}: benefits exceed costs in ${pct(r.probPositive)} of them, and the expected net value is ${money(m.mean)} (${money(r.perParticipant, 1)} per participant).`;
}

function renderProblems(problems: string[]): void {
  latest = null;
  results.innerHTML = `<div class="errors" role="alert"><strong>Fix these to run the simulation:</strong><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`;
}

function renderResults(r: Result): void {
  const m = r.npvSummary;
  const p = r.byPerspective;
  const stats = [
    stat("Expected net value", money(m.mean), `± ${money(1.96 * m.mcse)} simulation error`),
    stat("Benefit per $1 of cost", ratio(r.bcr), `90% of draws ${ratio(r.bcrInterval[0])}–${ratio(r.bcrInterval[1])}`),
    stat("Chance it pays off", pct(r.probPositive), `± ${pct(1.96 * r.probPositiveSe, 1)}`),
    stat("Return", Number.isFinite(r.irr) ? pct(r.irr, 1) : "–", r.payback === null ? "never pays back in the window" : `pays back in year ${r.payback}`),
  ].join("");

  const perspectiveRows = [
    ["Participants", dollars(p.participants)],
    ["Taxpayers", dollars(p.taxpayers)],
    ["Others in society", dollars(p.others)],
    ["Deadweight cost of taxation", dollars(p.deadweight)],
    ["Total", dollars(m.mean)],
  ];
  const percentiles = table(
    ["Percentile", "Net present value"],
    [
      ["5th", dollars(m.p5)],
      ["10th", dollars(m.p10)],
      ["25th", dollars(m.p25)],
      ["Median", dollars(m.p50)],
      ["75th", dollars(m.p75)],
      ["90th", dollars(m.p90)],
      ["95th", dollars(m.p95)],
    ],
    [false, true],
  );
  const histogramRows = r.histogram.map((b) => [`${money(b.lo)} to ${money(b.hi)}`, b.count.toLocaleString("en-US"), pct(b.count / r.draws, 1)]);
  const years = r.byYear.participants.length;
  const flowRows = Array.from({ length: years }, (_, t) => [
    String(t),
    dollars(r.byYear.participants[t]),
    dollars(r.byYear.taxpayers[t]),
    dollars(r.byYear.others[t]),
    dollars(r.byYear.deadweight[t]),
  ]);
  const tornadoRows = r.tornado.map((b) => [b.label, b.description, dollars(b.lowNpv), dollars(b.highNpv), dollars(b.swing)]);
  const correlationRows = r.correlations.map((c) => [c.label, num(c.rho, 2)]);

  results.innerHTML = `
    <p class="headline">${esc(headline(r))}</p>
    <div class="stats">${stats}</div>
    <h2>Range of outcomes</h2>
    ${legend([["Net gain", "s1"], ["Net loss", "s2"]])}
    <figure class="chart">${histogramChart(r.histogram, r.draws)}</figure>
    ${percentiles}
    <details><summary>Show the histogram as a table</summary>${table(["Net present value", "Draws", "Share"], histogramRows, [false, true, true])}</details>
    <h2>Who gains and who pays</h2>
    <p class="muted small">Expected present value to each group. Costs to taxpayers carry a deadweight cost of raising the money; taxpayer savings avoid it.</p>
    ${table(["Perspective", "Expected present value"], perspectiveRows, [false, true])}
    ${legend(FLOW_LEGEND)}
    <figure class="chart">${flowsChart(r)}</figure>
    <details><summary>Show flows by year</summary>${table(["Year", "Participants", "Taxpayers", "Others", "Deadweight"], flowRows, [true, true, true, true, true])}</details>
    <h2>Which assumptions matter</h2>
    <p class="muted small">Each bar moves one input to its 10th or 90th percentile while the rest stay at their medians. Longer bars are the numbers worth pinning down first.</p>
    ${legend([["Input at its 90th percentile", "s1"], ["Input at its 10th percentile", "s2"]])}
    <figure class="chart">${tornadoChart(r.tornado, r.baseNpv)}</figure>
    <details><summary>Show sensitivity tables</summary>
      ${table(["Input", "Range", "NPV at 10th pct", "NPV at 90th pct", "Swing"], tornadoRows, [false, false, true, true, true])}
      ${table(["Input", "Rank correlation with NPV"], correlationRows, [false, true])}
    </details>
    <div class="actions">
      <button type="button" id="copy-link">Copy share link</button>
      <button type="button" id="download-json">Download scenario</button>
      <button type="button" id="download-csv">Download draws (CSV)</button>
      <label class="note-text"><input type="file" id="upload" accept="application/json,.json" hidden />
        <button type="button" id="upload-button">Load scenario</button></label>
    </div>`;
  wireActions();
}

function download(name: string, type: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(): string {
  return (scenario.name || "scenario").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scenario";
}

function wireActions(): void {
  document.getElementById("copy-link")?.addEventListener("click", async (e) => {
    const button = e.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(location.href);
      button.textContent = "Link copied";
    } catch {
      button.textContent = "Copy failed; use the address bar";
    }
  });
  document.getElementById("download-json")?.addEventListener("click", () =>
    download(`${slug()}.json`, "application/json", JSON.stringify(scenario, null, 2)),
  );
  document.getElementById("download-csv")?.addEventListener("click", () => {
    if (!latest) return;
    const lines = ["draw,npv"];
    latest.npv.forEach((v, i) => lines.push(`${i + 1},${v.toFixed(2)}`));
    download(`${slug()}-draws.csv`, "text/csv", lines.join("\n"));
  });
  const upload = document.getElementById("upload") as HTMLInputElement | null;
  document.getElementById("upload-button")?.addEventListener("click", () => upload?.click());
  upload?.addEventListener("change", async () => {
    const file = upload.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!looksLikeScenario(parsed)) throw new Error("not a scenario");
      scenario = parsed;
      activePreset = -1;
      renderPresets();
      renderForm(form, scenario, settings, onChange);
      run();
    } catch {
      renderProblems(["That file is not a costengine scenario."]);
    }
  });
}

// Tooltips: one delegated listener, text set with textContent only.
const tip = document.getElementById("tip") as HTMLDivElement;
function place(e: PointerEvent): void {
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14;
  let y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}
document.addEventListener("pointerover", (e) => {
  const target = (e.target as Element).closest?.("[data-tip]");
  if (!target) return;
  const lines = JSON.parse(target.getAttribute("data-tip") ?? "[]") as string[];
  tip.replaceChildren(
    ...lines.map((text, i) => {
      const row = document.createElement("div");
      row.textContent = text;
      if (i === 0) row.className = "head";
      return row;
    }),
  );
  tip.hidden = false;
  place(e);
});
document.addEventListener("pointermove", (e) => {
  if (!tip.hidden) place(e);
});
document.addEventListener("pointerout", (e) => {
  if ((e.target as Element).closest?.("[data-tip]")) tip.hidden = true;
});

// Theme toggle, remembered per browser when storage is available.
const root = document.documentElement;
const themeButton = document.getElementById("theme") as HTMLButtonElement;
const isDark = () => {
  const set = root.getAttribute("data-theme");
  return set ? set === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};
try {
  const saved = localStorage.getItem("theme");
  if (saved) root.setAttribute("data-theme", saved);
} catch {
  /* storage unavailable */
}
const label = () => (themeButton.textContent = isDark() ? "Light" : "Dark");
label();
themeButton.addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    /* storage unavailable */
  }
  label();
});

form.addEventListener("submit", (e) => e.preventDefault());
renderPresets();
renderForm(form, scenario, settings, onChange);
run();
