#!/usr/bin/env node
// Bundles the library and CLI entrypoints with esbuild (ESM + CJS, plain +
// minified). Type declarations are emitted separately via `tsc` since
// esbuild does not generate `.d.ts` files.

import { build } from "esbuild";

const sharedOptions = {
  bundle: true,
  platform: "node",
  target: "node22",
  sourcemap: true,
};

async function buildIndex() {
  await Promise.all([
    build({
      ...sharedOptions,
      entryPoints: ["src/index.ts"],
      format: "esm",
      outfile: "dist/index.mjs",
    }),
    build({
      ...sharedOptions,
      entryPoints: ["src/index.ts"],
      format: "cjs",
      outfile: "dist/index.cjs",
    }),
    build({
      ...sharedOptions,
      entryPoints: ["src/index.ts"],
      format: "esm",
      outfile: "dist/index.min.mjs",
      minify: true,
    }),
    build({
      ...sharedOptions,
      entryPoints: ["src/index.ts"],
      format: "cjs",
      outfile: "dist/index.min.cjs",
      minify: true,
    }),
  ]);
}

async function buildCli() {
  await build({
    ...sharedOptions,
    entryPoints: ["src/cli.ts"],
    format: "cjs",
    outfile: "dist/cli.cjs",
  });
}

async function main() {
  await Promise.all([buildIndex(), buildCli()]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
