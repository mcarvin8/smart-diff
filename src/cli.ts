#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CliUsageError, HELP_TEXT, parseCliArgs } from "./cliOptions.js";
import { writeSummaryContextFiles } from "./contextFiles.js";
import { buildGitDiffSummaryContext, summarizeGitDiff } from "./index.js";
import { readPromptFiles } from "./promptFiles.js";

function readPackageVersion(): string {
  const packageJsonPath = join(__dirname, "../package.json");
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
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

  const systemPromptAppend = readPromptFiles(parsed.promptFiles);
  const options = systemPromptAppend
    ? { ...parsed.options, systemPromptAppend }
    : parsed.options;

  const emit = (text: string): void => {
    if (parsed.outFile) {
      writeFileSync(parsed.outFile, `${text}\n`, "utf8");
      process.stderr.write(`Wrote ${parsed.outFile}\n`);
    } else {
      process.stdout.write(`${text}\n`);
    }
  };

  if (parsed.emitContext) {
    const context = await buildGitDiffSummaryContext(options);
    const payload = parsed.outDir
      ? writeSummaryContextFiles(context, parsed.outDir)
      : { schemaVersion: 1, ...context };
    emit(JSON.stringify(payload, null, 2));
    return;
  }

  const { summary, usage } = await summarizeGitDiff(options);
  emit(summary);
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
