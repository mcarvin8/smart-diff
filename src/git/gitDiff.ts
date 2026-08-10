export { filterCommitsByMessageRegexes } from "./commitMessageFilter.js";

export { buildDiffPathspecs } from "./diffPathspecs.js";
export type { SecretRedactionRule } from "./diffRedaction.js";
export { DEFAULT_SECRET_PATTERNS, redactSecrets } from "./diffRedaction.js";
export type { DiffShapingOptions } from "./diffShaping.js";
export {
  buildDiffShapingGitArgs,
  DEFAULT_NOISE_EXCLUDES,
  shapeUnifiedDiff,
} from "./diffShaping.js";
export { parseDiffSummary } from "./diffSummaryParse.js";
export type {
  CommitInfo,
  DiffFileSummary,
  DiffPathFilter,
  DiffStatus,
  DiffSummary,
  GitDiffRangeQuery,
} from "./diffTypes.js";
export type { GitClient } from "./gitDiffOps.js";
export {
  createGitClient,
  getChangedFiles,
  getCommits,
  getDiff,
  getDiffSummary,
  getRepoRoot,
} from "./gitDiffOps.js";
