export { filterCommitsByMessageRegexes } from "./commitMessageFilter.js";

export type { PathFilterPredicate } from "./diffPathFilter.js";
export { buildPathFilterPredicate, matchesAnyPath } from "./diffPathFilter.js";
export type { SecretRedactionRule } from "./diffRedaction.js";
export { DEFAULT_SECRET_PATTERNS, redactSecrets } from "./diffRedaction.js";
export type { RenderedFileDiff } from "./diffRender.js";
export { renderFileDiff, renderUnifiedDiff } from "./diffRender.js";
export type { DiffShapingOptions } from "./diffShaping.js";
export { DEFAULT_NOISE_EXCLUDES, shapeUnifiedDiff } from "./diffShaping.js";
export {
  buildFileSummary,
  mergeFileSummariesByPath,
  summarizeFiles,
} from "./diffSummary.js";
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
