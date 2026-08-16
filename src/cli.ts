#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { CliUsageError, HELP_TEXT, parseCliArgs } from "./cliOptions.js";
import { summarizeGitDiff } from "./index.js";

function readPackageVersion(): string {
  const packageJsonUrl = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(packageJsonUrl), "utf8"),
  ) as {
    version: string;
  };
  return pkg.version;
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.kind === "help") {
    process.stdout.write(`${HELP_TEXT}\n`);
    return;
  }
  if (parsed.kind === "version") {
    process.stdout.write(`${readPackageVersion()}\n`);
    return;
  }

  const { summary, usage } = await summarizeGitDiff(parsed.options);
  process.stdout.write(`${summary}\n`);
  if (parsed.reportUsage) {
    process.stderr.write(`\n[usage] ${JSON.stringify(usage)}\n`);
  }
}

main().catch((err: unknown) => {
  if (err instanceof CliUsageError) {
    process.stderr.write(`${err.message}\n`);
  } else {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
  }
  process.exitCode = 1;
});
