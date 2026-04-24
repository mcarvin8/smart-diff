import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      // Strip .js extensions from TS relative imports so Vite's resolver
      // can find the corresponding .ts source files (replaces ts-jest
      // moduleNameMapper behavior).
      { find: /^(\.{1,2}\/.+)\.js$/, replacement: "$1" },
      { find: /^@src\/(.*)$/, replacement: `${new URL("./src/", import.meta.url).pathname}$1` },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/index.ts"],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
