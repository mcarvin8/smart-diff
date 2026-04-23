export type {
  CommitInfo,
  DiffFileSummary,
  DiffPathFilter,
  DiffStatus,
  DiffSummary,
  GitDiffRangeQuery,
} from "./diffTypes.js";

export { buildDiffPathspecs } from "./diffPathspecs.js";
export { filterCommitsByMessageRegexes } from "./commitMessageFilter.js";
export {
  createGitClient,
  getChangedFiles,
  getCommits,
  getDiff,
  getDiffSummary,
  getRepoRoot,
} from "./gitDiffOps.js";
export { parseDiffSummary } from "./diffSummaryParse.js";
export type { DiffShapingOptions } from "./diffShaping.js";
export {
  DEFAULT_NOISE_EXCLUDES,
  buildDiffShapingGitArgs,
  shapeUnifiedDiff,
} from "./diffShaping.js";
