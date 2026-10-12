const MINUS = "−";

export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Dollars, abbreviated: $1.2M, −$350K, $45. */
export function money(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return "–";
  const sign = x < 0 ? MINUS : "";
  const a = Math.abs(x);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (a >= size) return `${sign}$${(a / size).toFixed(digits)}${suffix}`;
  }
  return `${sign}$${a.toFixed(0)}`;
}

/** Whole dollars with separators. */
export function dollars(x: number): string {
  if (!Number.isFinite(x)) return "–";
  return `${x < 0 ? MINUS : ""}$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;
}

export function pct(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return "–";
  return `${(x * 100).toFixed(digits)}%`.replace("-", MINUS);
}

export function ratio(x: number): string {
  return Number.isFinite(x) ? `$${x.toFixed(2)}` : "–";
}

export function num(x: number, digits = 2): string {
  return Number.isFinite(x) ? x.toFixed(digits).replace("-", MINUS) : "–";
}
