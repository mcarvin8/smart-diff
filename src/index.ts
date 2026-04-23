import type { SimpleGit } from "simple-git";

import { generateSummary } from "./ai/aiSummary.js";
import type { LlmModelProvider, SummarizeFlags } from "./ai/aiTypes.js";
import type { LlmProviderId } from "./ai/llmProviders.js";
import {
  createGitClient,
  DEFAULT_NOISE_EXCLUDES,
  filterCommitsByMessageRegexes,
  getChangedFiles,
  getCommits,
  getDiff,
  getDiffSummary,
  type CommitInfo,
  type DiffPathFilter,
  type DiffShapingOptions,
} from "./git/gitDiff.js";

export type GitDiffAiSummaryOptions = {
  /** Start ref (older side of the range). */
  from: string;
  /** End ref; defaults to `HEAD`. */
  to?: string;
  /** Working directory of the git repository; defaults to `process.cwd()`. */
  cwd?: string;
  /** Use an existing `simple-git` instance instead of `cwd`. */
  git?: SimpleGit;
  /**
   * Only include these directories/files relative to the repo root (as in the tree), e.g. `src`, `packages/lib`.
   * If omitted or empty, the whole repository is considered (minus `excludeFolders`).
   */
  includeFolders?: string[];
  /**
   * Exclude these paths relative to the repo root, e.g. `node_modules`, `dist`.
   * Implemented with git `:(exclude)` pathspecs.
   */
  excludeFolders?: string[];
  /**
   * After excludes are applied, only commits whose full message matches at least one of these regexes are kept.
   * If omitted or all empty, there is no include filter.
   */
  commitMessageIncludeRegexes?: string[];
  /** Commits whose full message matches any of these regexes are dropped before building the diff. */
  commitMessageExcludeRegexes?: string[];
  /** Overrides the package default LLM system prompt (see `DEFAULT_GIT_DIFF_SYSTEM_PROMPT`). */
  systemPrompt?: string;
  /** Shown in the LLM user prompt (Team line) when set. */
  teamName?: string;
  model?: string;
  /**
   * Explicit LLM provider id. When omitted, falls back to `LLM_PROVIDER` env var
   * or auto-detection based on which provider credentials are present.
   */
  provider?: LlmProviderId;
  maxDiffChars?: number;
  /**
   * Number of context lines around each change (git `-U<n>`). Default git behavior is 3;
   * dropping to 0 or 1 is the single biggest token saver on modification-heavy diffs.
   */
  contextLines?: number;
  /** Pass `-w` / `--ignore-all-space` so pure-whitespace hunks don't consume tokens. */
  ignoreWhitespace?: boolean;
  /**
   * Strip low-value preamble lines (`diff --git`, `index`, mode changes, rename/copy metadata)
   * from the unified diff. `--- a/...`, `+++ b/...`, and `@@` hunk headers are kept.
   */
  stripDiffPreamble?: boolean;
  /**
   * Replace any hunk body longer than this many lines with an elision marker after
   * the truncation point. The `@@` header is preserved and the structured diff
   * summary still reflects the true counts.
   */
  maxHunkLines?: number;
  /**
   * Merge the built-in high-noise path list ({@link DEFAULT_NOISE_EXCLUDES}) into
   * `excludeFolders` — lockfiles, `dist`, `build`, `node_modules`, `coverage`, etc.
   */
  excludeDefaultNoise?: boolean;
  /**
   * Optional factory returning a Vercel AI SDK `LanguageModel` — bypass env-based
   * provider resolution (useful in tests and bespoke setups).
   */
  llmModelProvider?: LlmModelProvider;
};

function buildShapingFromOptions(
  options: GitDiffAiSummaryOptions,
): DiffShapingOptions | undefined {
  const shaping: DiffShapingOptions = {};
  if (options.contextLines !== undefined) {
    shaping.contextLines = options.contextLines;
  }
  if (options.ignoreWhitespace) shaping.ignoreWhitespace = true;
  if (options.stripDiffPreamble) shaping.stripDiffPreamble = true;
  if (options.maxHunkLines !== undefined) {
    shaping.maxHunkLines = options.maxHunkLines;
  }
  return Object.keys(shaping).length > 0 ? shaping : undefined;
}

function buildEffectiveExcludeFolders(
  options: GitDiffAiSummaryOptions,
): string[] | undefined {
  const userExcludes = options.excludeFolders ?? [];
  if (!options.excludeDefaultNoise) {
    return userExcludes.length > 0 ? userExcludes : undefined;
  }
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const p of [...DEFAULT_NOISE_EXCLUDES, ...userExcludes]) {
    const key = p.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(p);
  }
  return merged;
}

function hasNonEmptyTrimmed(arr?: string[]): boolean {
  return (arr ?? []).some((s) => s.trim().length > 0);
}

function shouldFilterByCommits(
  allCommits: CommitInfo[],
  filtered: CommitInfo[],
  opts: Pick<
    GitDiffAiSummaryOptions,
    "commitMessageIncludeRegexes" | "commitMessageExcludeRegexes"
  >,
): boolean {
  if (
    hasNonEmptyTrimmed(opts.commitMessageIncludeRegexes) ||
    hasNonEmptyTrimmed(opts.commitMessageExcludeRegexes)
  ) {
    return true;
  }
  return filtered.length !== allCommits.length;
}

/**
 * Produce an AI-assisted Markdown summary of the git changes between `from` and `to`,
 * honoring path filters, commit message include/exclude regexes, optional team label, and optional system prompt.
 */
export async function summarizeGitDiff(
  options: GitDiffAiSummaryOptions,
): Promise<string> {
  const git = options.git ?? createGitClient(options.cwd);
  const from = options.from;
  const to = options.to ?? "HEAD";

  const effectiveExcludeFolders = buildEffectiveExcludeFolders(options);
  const pathFilter: DiffPathFilter | undefined =
    hasNonEmptyTrimmed(options.includeFolders) ||
    hasNonEmptyTrimmed(effectiveExcludeFolders)
      ? {
          includeFolders: options.includeFolders,
          excludeFolders: effectiveExcludeFolders,
        }
      : undefined;

  const allCommits = await getCommits(git, from, to);
  const filteredCommits = filterCommitsByMessageRegexes(
    allCommits,
    options.commitMessageIncludeRegexes,
    options.commitMessageExcludeRegexes,
  );
  const filterByCommits = shouldFilterByCommits(
    allCommits,
    filteredCommits,
    options,
  );

  const shaping = buildShapingFromOptions(options);
  const rangeQuery = {
    from,
    to,
    commits: filteredCommits,
    filterByCommits,
    pathFilter,
    shaping,
  };

  const [diffText, fileNames, diffSummary] = await Promise.all([
    getDiff(git, rangeQuery),
    getChangedFiles(git, rangeQuery),
    getDiffSummary(git, rangeQuery),
  ]);

  const summarizeFlags: SummarizeFlags = {
    from,
    to,
    team: options.teamName,
    model: options.model,
    provider: options.provider,
    maxDiffChars: options.maxDiffChars,
    systemPrompt: options.systemPrompt,
    commitMessageIncludeRegexes: options.commitMessageIncludeRegexes,
    commitMessageExcludeRegexes: options.commitMessageExcludeRegexes,
  };

  return generateSummary({
    diffText,
    fileNames,
    commits: filteredCommits,
    flags: summarizeFlags,
    llmModelProvider: options.llmModelProvider,
    diffSummary,
  });
}

export type {
  CommitInfo,
  DiffFileSummary,
  DiffPathFilter,
  DiffShapingOptions,
  DiffSummary,
  GitDiffRangeQuery,
} from "./git/gitDiff.js";
export {
  DEFAULT_NOISE_EXCLUDES,
  buildDiffPathspecs,
  buildDiffShapingGitArgs,
  createGitClient,
  filterCommitsByMessageRegexes,
  getChangedFiles,
  getCommits,
  getDiff,
  getDiffSummary,
  getRepoRoot,
  shapeUnifiedDiff,
} from "./git/gitDiff.js";

export type {
  GenerateSummaryInput,
  LlmModelProvider,
  SummarizeFlags,
} from "./ai/aiTypes.js";
export {
  generateSummary,
  resolveLlmMaxDiffChars,
  truncateUnifiedDiffForLlm,
} from "./ai/aiSummary.js";

export type {
  LlmProviderId,
  ResolveLanguageModelOptions,
} from "./ai/llmProviders.js";
export {
  defaultModelForProvider,
  detectLlmProvider,
  isLlmProviderConfigured,
  parseLlmDefaultHeadersFromEnv,
  resolveLanguageModel,
  resolveLlmBaseUrl,
} from "./ai/llmProviders.js";

export {
  DEFAULT_GIT_DIFF_SYSTEM_PROMPT,
  LLM_GATEWAY_REQUIRED_MESSAGE,
} from "./ai/aiConstants.js";
