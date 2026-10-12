import type { Bin, Result, TornadoBar } from "../engine";
import { niceStep } from "../engine";
import { esc, money, pct } from "./format";

type Scale = (v: number) => number;

const linear =
  (d0: number, d1: number, r0: number, r1: number): Scale =>
  (v) =>
    r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

function ticks(lo: number, hi: number, target = 5): number[] {
  const step = niceStep((hi - lo) / target);
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const out: number[] = [];
  for (let i = 0; start + i * step <= end + step * 1e-9; i++) out.push(+(start + i * step).toPrecision(12));
  return out;
}

function innerTicks(lo: number, hi: number, target = 6): number[] {
  const step = niceStep((hi - lo) / target);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

function tip(lines: string[]): string {
  return `data-tip="${esc(JSON.stringify(lines))}"`;
}

function vbar(x: number, w: number, base: number, end: number, cls: string): string {
  const h = Math.abs(end - base);
  if (h < 0.5 || w <= 0) return "";
  const r = Math.min(4, w / 2, h);
  const up = end < base;
  const y0 = base;
  const y1 = end;
  const d = up
    ? `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`
    : `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
  return `<path class="bar ${cls}" d="${d}"/>`;
}

function hbar(y: number, h: number, base: number, end: number, cls: string): string {
  const w = Math.abs(end - base);
  if (w < 0.5 || h <= 0) return "";
  const r = Math.min(4, h / 2, w);
  const right = end > base;
  const d = right
    ? `M${base},${y}H${end - r}Q${end},${y} ${end},${y + r}V${y + h - r}Q${end},${y + h} ${end - r},${y + h}H${base}Z`
    : `M${base},${y}H${end + r}Q${end},${y} ${end},${y + r}V${y + h - r}Q${end},${y + h} ${end + r},${y + h}H${base}Z`;
  return `<path class="bar ${cls}" d="${d}"/>`;
}

function yGrid(parts: string[], values: number[], y: Scale, left: number, right: number, label: (v: number) => string): void {
  for (const v of values) {
    parts.push(`<line class="grid" x1="${left}" x2="${right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`);
    parts.push(`<text class="tick" x="${left - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(label(v))}</text>`);
  }
}

export function histogramChart(bins: Bin[], draws: number): string {
  const left = 64, right = 16, top = 12, plotW = 560, plotH = 220, bottom = 44;
  const width = left + plotW + right;
  const height = top + plotH + bottom;
  const lo = bins[0].lo;
  const hi = bins[bins.length - 1].hi;
  const x = linear(lo, hi, left, left + plotW);
  const maxShare = Math.max(...bins.map((b) => b.count / draws));
  const yt = ticks(0, maxShare, 4);
  const y = linear(0, yt[yt.length - 1], top + plotH, top);
  const parts = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Distribution of net present value">`];
  yGrid(parts, yt, y, left, left + plotW, (v) => pct(v, v < 0.1 && v > 0 ? 1 : 0));
  for (const v of innerTicks(lo, hi, 6)) {
    parts.push(`<text class="tick" x="${x(v).toFixed(1)}" y="${top + plotH + 18}" text-anchor="middle">${esc(money(v, Math.abs(v) >= 1e6 ? 1 : 0))}</text>`);
  }
  const hits: string[] = [];
  for (const b of bins) {
    const x0 = x(b.lo) + 1;
    const w = x(b.hi) - x(b.lo) - 2;
    const share = b.count / draws;
    const cls = b.hi <= 0 ? "s2" : "s1";
    parts.push(vbar(x0, w, y(0), y(share), cls));
    hits.push(
      `<rect class="hit" x="${x(b.lo).toFixed(1)}" y="${top}" width="${(x(b.hi) - x(b.lo)).toFixed(1)}" height="${plotH}" ${tip([
        `${money(b.lo)} to ${money(b.hi)}`,
        `${pct(share, 1)} of draws (${b.count.toLocaleString("en-US")})`,
      ])}/>`,
    );
  }
  if (lo < 0 && hi > 0) {
    parts.push(`<line class="zero" x1="${x(0).toFixed(1)}" x2="${x(0).toFixed(1)}" y1="${top}" y2="${top + plotH}"/>`);
    parts.push(`<text class="note" x="${(x(0) + 6).toFixed(1)}" y="${top + 10}">break-even</text>`);
  }
  parts.push(`<line class="axisline" x1="${left}" x2="${left + plotW}" y1="${y(0)}" y2="${y(0)}"/>`);
  parts.push(...hits);
  parts.push(`<text class="axis" x="${left + plotW / 2}" y="${height - 6}" text-anchor="middle">Net present value</text>`);
  parts.push(`<text class="axis" transform="rotate(-90)" x="${-(top + plotH / 2)}" y="14" text-anchor="middle">Share of draws</text>`);
  parts.push("</svg>");
  return parts.join("");
}

/** One input at its 10th or 90th percentile, the rest at their medians. */
export function tornadoChart(bars: TornadoBar[], base: number, limit = 8): string {
  const shown = bars.slice(0, limit);
  if (!shown.length) return "";
  const labelW = 250, right = 24, top = 8, rowH = 30, bottom = 44, plotW = 400;
  const width = labelW + plotW + right;
  const height = top + rowH * shown.length + bottom;
  const values = shown.flatMap((b) => [b.lowNpv, b.highNpv]).concat(base);
  const xt = ticks(Math.min(...values), Math.max(...values), 4);
  const x = linear(xt[0], xt[xt.length - 1], labelW, labelW + plotW);
  const parts = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Sensitivity of net present value to each input">`];
  const baseY = top + rowH * shown.length;
  for (const v of xt) {
    parts.push(`<line class="grid" x1="${x(v).toFixed(1)}" x2="${x(v).toFixed(1)}" y1="${top}" y2="${baseY}"/>`);
    parts.push(`<text class="tick" x="${x(v).toFixed(1)}" y="${baseY + 18}" text-anchor="middle">${esc(money(v, 1))}</text>`);
  }
  const hits: string[] = [];
  shown.forEach((b, i) => {
    const yTop = top + rowH * i + 6;
    const h = rowH - 12;
    const label = b.label.length > 36 ? `${b.label.slice(0, 35)}…` : b.label;
    parts.push(`<text class="label" x="${labelW - 10}" y="${yTop + h / 2 + 4}" text-anchor="end">${esc(label)}</text>`);
    parts.push(hbar(yTop, h, x(base), x(b.lowNpv), "s2"));
    parts.push(hbar(yTop, h, x(base), x(b.highNpv), "s1"));
    hits.push(
      `<rect class="hit" x="0" y="${top + rowH * i}" width="${width}" height="${rowH}" ${tip([
        b.label,
        `Input ${b.description}`,
        `At its 10th percentile (${fmtInput(b.lowInput)}): ${money(b.lowNpv)}`,
        `At its 90th percentile (${fmtInput(b.highInput)}): ${money(b.highNpv)}`,
      ])}/>`,
    );
  });
  parts.push(`<line class="zero" x1="${x(base).toFixed(1)}" x2="${x(base).toFixed(1)}" y1="${top}" y2="${baseY}"/>`);
  parts.push(...hits);
  parts.push(`<text class="axis" x="${labelW + plotW / 2}" y="${height - 6}" text-anchor="middle">Net present value (line: all inputs at their medians)</text>`);
  parts.push("</svg>");
  return parts.join("");
}

function fmtInput(v: number): string {
  if (Math.abs(v) >= 1000) return money(v);
  return String(+v.toPrecision(3));
}

const FLOW_SERIES = [
  ["participants", "Participants", "s1"],
  ["taxpayers", "Taxpayers", "s2"],
  ["others", "Others", "s3"],
  ["deadweight", "Deadweight cost", "s4"],
] as const;

export const FLOW_LEGEND = FLOW_SERIES.map(([, label, cls]) => [label, cls] as const);

export function flowsChart(r: Result): string {
  const h = r.byYear.participants.length;
  const left = 64, right = 16, top = 12, plotW = 560, plotH = 220, bottom = 44;
  const width = left + plotW + right;
  const height = top + plotH + bottom;
  let lo = 0;
  let hi = 0;
  for (let t = 0; t < h; t++) {
    let pos = 0;
    let neg = 0;
    for (const [key] of FLOW_SERIES) {
      const v = r.byYear[key][t];
      if (v > 0) pos += v;
      else neg += v;
    }
    hi = Math.max(hi, pos);
    lo = Math.min(lo, neg);
  }
  const yt = ticks(lo, hi || 1, 5);
  const y = linear(yt[0], yt[yt.length - 1], top + plotH, top);
  const step = plotW / h;
  const barW = Math.max(2, Math.min(28, step * 0.7));
  const parts = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Expected discounted net benefits by year and perspective">`];
  yGrid(parts, yt, y, left, left + plotW, (v) => money(v, 1));
  const every = Math.max(1, Math.ceil(h / 12));
  const hits: string[] = [];
  let cumulative = 0;
  for (let t = 0; t < h; t++) {
    const cx = left + step * (t + 0.5);
    if (t % every === 0) parts.push(`<text class="tick" x="${cx.toFixed(1)}" y="${top + plotH + 18}" text-anchor="middle">${t}</text>`);
    let pos = 0;
    let neg = 0;
    const lines = [`Year ${t}`];
    let net = 0;
    for (const [key, label, cls] of FLOW_SERIES) {
      const v = r.byYear[key][t];
      net += v;
      if (Math.abs(v) < 1e-9) continue;
      lines.push(`${label}: ${money(v)}`);
      const from = v > 0 ? pos : neg;
      const to = from + v;
      parts.push(segment(cx - barW / 2, barW, y(from), y(to), cls));
      if (v > 0) pos = to;
      else neg = to;
    }
    cumulative += net;
    lines.push(`Net ${money(net)}; cumulative ${money(cumulative)}`);
    hits.push(`<rect class="hit" x="${(left + step * t).toFixed(1)}" y="${top}" width="${step.toFixed(1)}" height="${plotH}" ${tip(lines)}/>`);
  }
  parts.push(`<line class="axisline" x1="${left}" x2="${left + plotW}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`);
  if (r.payback !== null) {
    const px = left + step * (r.payback + 0.5);
    parts.push(`<line class="reference" x1="${px.toFixed(1)}" x2="${px.toFixed(1)}" y1="${top}" y2="${top + plotH}"/>`);
    parts.push(`<text class="note" x="${(px + 6).toFixed(1)}" y="${top + 10}">pays back</text>`);
  }
  parts.push(...hits);
  parts.push(`<text class="axis" x="${left + plotW / 2}" y="${height - 6}" text-anchor="middle">Years after the program starts</text>`);
  parts.push("</svg>");
  return parts.join("");
}

function segment(x: number, w: number, from: number, to: number, cls: string): string {
  const top = Math.min(from, to);
  const h = Math.abs(to - from);
  if (h < 0.5) return "";
  const gap = h > 3 ? 1 : 0;
  return `<rect class="bar ${cls}" x="${x.toFixed(1)}" y="${(top + (to < from ? gap : 0)).toFixed(1)}" width="${w.toFixed(1)}" height="${(h - gap).toFixed(1)}" rx="1.5"/>`;
}
