import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { main } from "../src/cli";
import { PRESETS } from "../src/engine";

afterEach(() => vi.restoreAllMocks());

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((s: string) => void out.push(s));
  vi.spyOn(console, "error").mockImplementation((s: string) => void err.push(s));
  return { out, err };
}

test("runs a preset by name and a scenario file", () => {
  const io = capture();
  expect(main(["run", "reentry services", "--draws", "500"])).toBe(0);
  expect(io.out.join("\n")).toContain("chance benefits exceed costs");
  const dir = mkdtempSync(join(tmpdir(), "ce-"));
  const file = join(dir, "s.json");
  writeFileSync(file, JSON.stringify(PRESETS[0]));
  expect(main(["run", file, "--draws", "500", "--json"])).toBe(0);
  const parsed = JSON.parse(io.out.at(-1)!);
  expect(parsed.draws).toBe(500);
  expect(parsed.byYear.participants).toHaveLength(PRESETS[0].horizon);
});

test("lists and shows presets, and reports bad input", () => {
  const io = capture();
  expect(main(["presets"])).toBe(0);
  expect(main(["show", "home visiting"])).toBe(0);
  expect(JSON.parse(io.out.at(-1)!).name).toBe("Home visiting");
  expect(main(["run", "job training", "--draws", "x"])).toBe(2);
  expect(main(["run", "job training", "--draws", "5"])).toBe(2);
  expect(main(["nonsense"])).toBe(2);
  expect(io.err.join("\n")).toContain("draws");
});
