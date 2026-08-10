import { parseArgs } from "node:util";

import type { LlmProviderId } from "./ai/llmProviders.js";
import type { GitDiffAiSummaryOptions } from "./index.js";

/** Thrown for bad CLI input (missing ref, unparsable number). Caught by the entrypoint and printed without a stack trace. */
export class CliUsageError extends Error {}

export type ParsedCli =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "run"; options: GitDiffAiSummaryOptions; reportUsage: boolean };

export const HELP_TEXT = `smart-diff <from> [to] [options]

Summarizes a git diff between two refs using an LLM, printed as Markdown to stdout.

Arguments:
  <from>                    Start ref (required; also settable via --from)
  [to]                      End ref (default: HEAD; also settable via --to)

Core:
  --cwd <path>              Repo working directory (default: process.cwd())
  --include <path>          Only include this path (repeatable)
  --exclude <path>          Exclude this path (repeatable)
  --commit-include <regex>  Only keep commits whose message matches (repeatable, OR)
  --commit-exclude <regex>  Drop commits whose message matches (repeatable)
  --team <name>             Team label added to the LLM prompt
  --system-prompt <text>    Overrides the default system prompt
  --provider <id>           LLM provider id (openai, anthropic, google, bedrock, mistral, cohere, groq, xai, deepseek, openai-compatible)
  --model <id>              Model id override

Token reduction (see README "Handling large diffs"):
  --max-diff-chars <n>      Caps unified diff size sent to the model
  --map-reduce              Batch an oversized diff instead of hard-truncating it
  --context-lines <n>       Context lines per hunk (git diff -U<n>)
  --ignore-whitespace       Drop pure-whitespace hunks
  --strip-diff-preamble     Strip diff --git/index/mode noise lines
  --max-hunk-lines <n>      Elide hunk bodies longer than this many lines
  --exclude-default-noise   Skip lockfiles/dist/build/coverage/node_modules

Reliability:
  --max-retries <n>         Retry count for transient LLM call failures (default 2)

Security:
  --redact-secrets          Mask likely secrets/credentials before sending to the LLM

Other:
  --usage                   Print aggregated token usage to stderr after the summary
  -h, --help                Show this help
  -v, --version             Print the installed version

Provider credentials and other env vars (LLM_PROVIDER, LLM_MODEL, LLM_MAX_DIFF_CHARS,
LLM_MAX_RETRIES, LLM_TEMPERATURE, ...) are documented in the README's "Provider configuration" section.`;

function parseIntFlag(
  flagName: string,
  raw: string | undefined,
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new CliUsageError(
      `Invalid number for --${flagName}: ${JSON.stringify(raw)}`,
    );
  }
  return n;
}

/** Parse `process.argv.slice(2)` into help/version/run. Throws `CliUsageError` for bad input. Pure — no I/O, no process access. */
export function parseCliArgs(argv: string[]): ParsedCli {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      from: { type: "string" },
      to: { type: "string" },
      cwd: { type: "string" },
      include: { type: "string", multiple: true },
      exclude: { type: "string", multiple: true },
      "commit-include": { type: "string", multiple: true },
      "commit-exclude": { type: "string", multiple: true },
      "system-prompt": { type: "string" },
      team: { type: "string" },
      model: { type: "string" },
      provider: { type: "string" },
      "max-diff-chars": { type: "string" },
      "max-retries": { type: "string" },
      "map-reduce": { type: "boolean" },
      "context-lines": { type: "string" },
      "ignore-whitespace": { type: "boolean" },
      "strip-diff-preamble": { type: "boolean" },
      "max-hunk-lines": { type: "string" },
      "exclude-default-noise": { type: "boolean" },
      "redact-secrets": { type: "boolean" },
      usage: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.help) return { kind: "help" };
  if (values.version) return { kind: "version" };

  const from = values.from ?? positionals[0];
  if (!from) {
    throw new CliUsageError(
      "Missing required <from> ref. Usage: smart-diff <from> [to] [options]\nRun with --help for details.",
    );
  }
  const to = values.to ?? positionals[1];

  const options: GitDiffAiSummaryOptions = {
    from,
    to,
    cwd: values.cwd,
    includeFolders: values.include,
    excludeFolders: values.exclude,
    commitMessageIncludeRegexes: values["commit-include"],
    commitMessageExcludeRegexes: values["commit-exclude"],
    systemPrompt: values["system-prompt"],
    teamName: values.team,
    model: values.model,
    provider: values.provider as LlmProviderId | undefined,
    maxDiffChars: parseIntFlag("max-diff-chars", values["max-diff-chars"]),
    maxRetries: parseIntFlag("max-retries", values["max-retries"]),
    mapReduce: values["map-reduce"],
    contextLines: parseIntFlag("context-lines", values["context-lines"]),
    ignoreWhitespace: values["ignore-whitespace"],
    stripDiffPreamble: values["strip-diff-preamble"],
    maxHunkLines: parseIntFlag("max-hunk-lines", values["max-hunk-lines"]),
    excludeDefaultNoise: values["exclude-default-noise"],
    redactSecrets: values["redact-secrets"],
  };

  return { kind: "run", options, reportUsage: values.usage ?? false };
}
