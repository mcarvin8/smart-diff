import * as core from "@actions/core";

import type { GitDiffAiSummaryOptions, LlmProviderId } from "../index.js";
import { summarizeGitDiff } from "../index.js";

function optionalInt(name: string): number | undefined {
  const raw = core.getInput(name).trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(
      `Invalid number for input "${name}": ${JSON.stringify(raw)}`,
    );
  }
  return n;
}

function optionalString(name: string): string | undefined {
  const raw = core.getInput(name).trim();
  return raw || undefined;
}

function optionalMultiline(name: string): string[] | undefined {
  const values = core.getMultilineInput(name).filter((v) => v.trim());
  return values.length > 0 ? values : undefined;
}

function buildOptions(): GitDiffAiSummaryOptions {
  const from = core.getInput("from", { required: true });

  return {
    from,
    to: optionalString("to"),
    mergeBase: core.getBooleanInput("merge-base"),
    cwd: optionalString("working-directory"),
    includeFolders: optionalMultiline("include"),
    excludeFolders: optionalMultiline("exclude"),
    commitMessageIncludeRegexes: optionalMultiline("commit-include"),
    commitMessageExcludeRegexes: optionalMultiline("commit-exclude"),
    teamName: optionalString("team"),
    systemPrompt: optionalString("system-prompt"),
    provider: optionalString("provider") as LlmProviderId | undefined,
    model: optionalString("model"),
    maxDiffChars: optionalInt("max-diff-chars"),
    maxRetries: optionalInt("max-retries"),
    mapReduce: core.getBooleanInput("map-reduce"),
    contextLines: optionalInt("context-lines"),
    ignoreWhitespace: core.getBooleanInput("ignore-whitespace"),
    stripDiffPreamble: core.getBooleanInput("strip-diff-preamble"),
    maxHunkLines: optionalInt("max-hunk-lines"),
    excludeDefaultNoise: core.getBooleanInput("exclude-default-noise"),
    redactSecrets: core.getBooleanInput("redact-secrets"),
  };
}

async function run(): Promise<void> {
  try {
    const options = buildOptions();
    const { summary, usage } = await summarizeGitDiff(options);

    core.setOutput("summary", summary);
    core.setOutput("request-count", usage.requestCount);
    core.setOutput("input-tokens", usage.inputTokens);
    core.setOutput("output-tokens", usage.outputTokens);
    core.setOutput("total-tokens", usage.totalTokens);
    core.setOutput("cached-input-tokens", usage.cachedInputTokens);

    try {
      await core.summary
        .addHeading("smart-diff summary")
        .addRaw(summary)
        .write();
    } catch {
      // GITHUB_STEP_SUMMARY isn't available in every context (e.g. local runs); non-fatal.
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

void run();
