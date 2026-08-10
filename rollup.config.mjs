import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

export default [
  {
    input: "./src/index.ts",
    output: [
      {
        file: "./dist/index.mjs",
        format: "es",
        sourcemap: true,
      },
      {
        file: "./dist/index.cjs",
        format: "cjs",
        sourcemap: true,
      },
      {
        file: "./dist/index.umd.js",
        format: "umd",
        name: "jsTemplate",
        globals: {},
        sourcemap: true,
      },
      {
        file: "./dist/index.min.mjs",
        format: "es",
        sourcemap: true,
        plugins: [terser()],
      },
      {
        file: "./dist/index.min.cjs",
        format: "cjs",
        sourcemap: true,
        plugins: [terser()],
      },
      {
        file: "./dist/index.min.umd.js",
        format: "umd",
        name: "jsTemplate",
        globals: {},
        sourcemap: true,
        plugins: [terser()],
      },
    ],
    plugins: [
      typescript({
        tsconfig: "tsconfig.json",
        declaration: true,
        outDir: "./dist",
        declarationDir: "./dist/typings",
      }),
    ],
  },
  {
    input: "./src/cli.ts",
    output: {
      file: "./dist/cli.cjs",
      format: "cjs",
      sourcemap: true,
    },
    plugins: [
      typescript({
        tsconfig: "tsconfig.json",
        declaration: false,
      }),
    ],
  },
];
