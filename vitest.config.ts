import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: { include: ["src/engine/**", "src/ui/charts.ts", "src/ui/format.ts", "src/ui/share.ts", "src/cli.ts"] },
  },
});
