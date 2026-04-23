import type { DiffShapingOptions } from "./diffShaping.js";

export type CommitInfo = {
  hash: string;
  message: string;
};

export type DiffStatus =
  | "added"
  | "deleted"
  | "modified"
  | "renamed"
  | "copied"
  | "type-changed"
  | "unknown";

export type DiffFileSummary = {
  path: string;
  status: DiffStatus;
  additions: number;
  deletions: number;
  oldPath?: string;
  newPath?: string;
};

export type DiffSummary = {
  files: DiffFileSummary[];
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
};

/** Restrict or exclude paths for `git diff` / `git show`, relative to repository root as users see them (e.g. `src`, `node_modules`). */
export type DiffPathFilter = {
  /** If set and non-empty, only these paths (under the repo root) are included. If omitted or empty, the whole repository is included (subject to `excludeFolders`). */
  includeFolders?: string[];
  /** Paths under the repo root excluded from the diff (git `:(exclude)` pathspecs). */
  excludeFolders?: string[];
};

/** Arguments shared by `getDiff`, `getDiffSummary`, and `getChangedFiles`. */
export type GitDiffRangeQuery = {
  from: string;
  to: string;
  commits: CommitInfo[];
  filterByCommits: boolean;
  pathFilter?: DiffPathFilter;
  /** When set, skips `git rev-parse` and uses this as the repo root for pathspecs. */
  repoRootOverride?: string;
  /** Token-reduction controls applied to the unified diff produced by `getDiff`. */
  shaping?: DiffShapingOptions;
};
