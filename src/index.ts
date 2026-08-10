import {
  type GenerateSummaryInput,
  generateSummary,
  generateSummaryWithUsage,
  type LlmModelProvider,
  type LlmProviderId,
  type LlmUsageReport,
  type SummarizeFlags,
} from "./ai/index.js";
import {
  type CommitInfo,
  createGitClient,
  DEFAULT_NOISE_EXCLUDES,
  type DiffPathFilter,
  type DiffShapingOptions,
  filterCommitsByMessageRegexes,
  type GitClient,
  getChangedFiles,
  getCommits,
  getDiff,
  getDiffSummary,
  type SecretRedactionRule,
} from "./git/index.js";

export type GitDiffAiSummaryOptions = {
  /** Start ref (older side of the range). */
  from: string;
  /** End ref; defaults to `HEAD`. */
  to?: string;
  /** Working directory of the git repository; defaults to `process.cwd()`. */
  cwd?: string;
  /** Use an existing `GitClient` instance instead of `cwd`. */
  git?: GitClient;
  /**
   * Only include these directories/files relative to the repo root (as in the tree), e.g. `src`, `packages/lib`.
   * If omitted or empty, the whole repository is considered (minus `excludeFolders`).
   */
  includeFolders?: string[];
  /**
   * Exclude these paths relative to the repo root, e.g. `node_modules`, `dist`.
   * Applied client-side to the diff's changed-path list (directory-prefix match).
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
   * Max retry count for transient LLM call failures (rate limits, 5xx, network
   * errors). Default 2 (matches the Vercel AI SDK's own default); also settable via
   * `LLM_MAX_RETRIES`. Set to 0 to disable retries.
   */
  maxRetries?: number;
  /**
   * When the diff exceeds `maxDiffChars`, split it into per-file batches, summarize
   * each batch independently (map), then synthesize one final summary from the
   * batch summaries (reduce) instead of hard-truncating the diff. No effect when
   * the diff already fits within `maxDiffChars`.
   */
  mapReduce?: boolean;
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
   * Redact likely secrets/credentials from the diff text before it's sent to the
   * LLM — cloud provider keys, VCS/chat tokens, private key blocks, JWTs, `Bearer`
   * headers, basic-auth URL passwords, and generic `KEY=value` assignments.
   */
  redactSecrets?: boolean;
  /**
   * Overrides the built-in secret-detection rules used when `redactSecrets` is true.
   */
  secretPatterns?: readonly SecretRedactionRule[];
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
  if (options.redactSecrets) shaping.redactSecrets = true;
  if (options.secretPatterns !== undefined) {
    shaping.secretPatterns = options.secretPatterns;
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

async function prepareSummaryInput(
  options: GitDiffAiSummaryOptions,
): Promise<GenerateSummaryInput> {
  const git = options.git ?? (await createGitClient(options.cwd));
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
    maxRetries: options.maxRetries,
    mapReduce: options.mapReduce,
    systemPrompt: options.systemPrompt,
    commitMessageIncludeRegexes: options.commitMessageIncludeRegexes,
    commitMessageExcludeRegexes: options.commitMessageExcludeRegexes,
  };

  return {
    diffText,
    fileNames,
    commits: filteredCommits,
    flags: summarizeFlags,
    llmModelProvider: options.llmModelProvider,
    diffSummary,
  };
}

/**
 * Produce an AI-assisted Markdown summary of the git changes between `from` and `to`,
 * honoring path filters, commit message include/exclude regexes, optional team label, and optional system prompt.
 */
export async function summarizeGitDiff(
  options: GitDiffAiSummaryOptions,
): Promise<string> {
  return generateSummary(await prepareSummaryInput(options));
}

/**
 * Same as `summarizeGitDiff`, but also returns token usage aggregated across
 * every LLM call made to produce the summary. See {@link LlmUsageReport}.
 */
export async function summarizeGitDiffWithUsage(
  options: GitDiffAiSummaryOptions,
): Promise<{ summary: string; usage: LlmUsageReport }> {
  return generateSummaryWithUsage(await prepareSummaryInput(options));
}

export type {
  GenerateSummaryInput,
  LlmModelProvider,
  LlmProviderId,
  LlmUsageReport,
  ResolveLanguageModelOptions,
  SummarizeFlags,
} from "./ai/index.js";
export {
  DEFAULT_GIT_DIFF_SYSTEM_PROMPT,
  DEFAULT_MAP_REDUCE_MAP_SYSTEM_PROMPT,
  DEFAULT_MAP_REDUCE_REDUCE_SYSTEM_PROMPT,
  defaultModelForProvider,
  detectLlmProvider,
  generateSummary,
  generateSummaryWithUsage,
  groupDiffChunksByBudget,
  isLlmProviderConfigured,
  LLM_GATEWAY_REQUIRED_MESSAGE,
  parseLlmDefaultHeadersFromEnv,
  resolveLanguageModel,
  resolveLlmBaseUrl,
  resolveLlmMaxDiffChars,
  resolveLlmMaxRetries,
  splitUnifiedDiffIntoFileChunks,
  truncateUnifiedDiffForLlm,
} from "./ai/index.js";
export type {
  CommitInfo,
  DiffFileSummary,
  DiffPathFilter,
  DiffShapingOptions,
  DiffSummary,
  GitClient,
  GitDiffRangeQuery,
  PathFilterPredicate,
  RenderedFileDiff,
  SecretRedactionRule,
} from "./git/index.js";
export {
  buildFileSummary,
  buildPathFilterPredicate,
  createGitClient,
  DEFAULT_NOISE_EXCLUDES,
  DEFAULT_SECRET_PATTERNS,
  filterCommitsByMessageRegexes,
  getChangedFiles,
  getCommits,
  getDiff,
  getDiffSummary,
  getRepoRoot,
  matchesAnyPath,
  mergeFileSummariesByPath,
  redactSecrets,
  renderFileDiff,
  renderUnifiedDiff,
  shapeUnifiedDiff,
  summarizeFiles,
} from "./git/index.js";
