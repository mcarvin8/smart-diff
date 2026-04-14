export type {
  CommitInfo,
  DiffFileSummary,
  DiffPathFilter,
  DiffStatus,
  DiffSummary,
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
