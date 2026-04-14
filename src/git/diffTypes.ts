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
