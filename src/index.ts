import type { SimpleGit } from "simple-git";

import { generateSummary, type SummarizeFlags } from "./ai/aiSummary.js";
import type { OpenAiLikeClient } from "./ai/openAIConfig.js";
import {
  createGitClient,
  filterCommitsByMessageRegexes,
  getChangedFiles,
  getCommits,
  getDiff,
  getDiffSummary,
  type CommitInfo,
  type DiffPathFilter,
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
  maxDiffChars?: number;
  /** Optional OpenAI-compatible client factory (for tests or custom SDK wiring). */
  openAiClientProvider?: () => Promise<OpenAiLikeClient>;
};

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

  const pathFilter: DiffPathFilter | undefined =
    hasNonEmptyTrimmed(options.includeFolders) ||
    hasNonEmptyTrimmed(options.excludeFolders)
      ? {
          includeFolders: options.includeFolders,
          excludeFolders: options.excludeFolders,
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

  const [diffText, fileNames, diffSummary] = await Promise.all([
    getDiff(git, from, to, filteredCommits, filterByCommits, pathFilter),
    getChangedFiles(
      git,
      from,
      to,
      filteredCommits,
      filterByCommits,
      pathFilter,
    ),
    getDiffSummary(git, from, to, filteredCommits, filterByCommits, pathFilter),
  ]);

  const summarizeFlags: SummarizeFlags = {
    from,
    to,
    team: options.teamName,
    model: options.model,
    maxDiffChars: options.maxDiffChars,
    systemPrompt: options.systemPrompt,
    commitMessageIncludeRegexes: options.commitMessageIncludeRegexes,
    commitMessageExcludeRegexes: options.commitMessageExcludeRegexes,
  };

  return generateSummary(
    diffText,
    fileNames,
    filteredCommits,
    summarizeFlags,
    options.openAiClientProvider,
    diffSummary,
  );
}

export type {
  CommitInfo,
  DiffFileSummary,
  DiffPathFilter,
  DiffSummary,
} from "./git/gitDiff.js";
export {
  buildDiffPathspecs,
  createGitClient,
  filterCommitsByMessageRegexes,
  getChangedFiles,
  getCommits,
  getDiff,
  getDiffSummary,
  getRepoRoot,
} from "./git/gitDiff.js";

export type { SummarizeFlags } from "./ai/aiSummary.js";
export {
  DEFAULT_GIT_DIFF_SYSTEM_PROMPT,
  generateSummary,
  LLM_GATEWAY_REQUIRED_MESSAGE,
  resolveLlmMaxDiffChars,
  truncateUnifiedDiffForLlm,
} from "./ai/aiSummary.js";

export type {
  OpenAiLikeClient,
  OpenAiLikeClientInit,
} from "./ai/openAIConfig.js";
export {
  createOpenAiLikeClient,
  parseLlmDefaultHeadersFromEnv,
  resolveLlmBaseUrl,
  resolveOpenAiLikeClientInit,
  shouldUseLlmGateway,
  splitPromotableAuthorizationFromHeaders,
} from "./ai/openAIConfig.js";
