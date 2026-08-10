import type { DiffChange } from "@scolladon/tsgit";

import { mapChangeTypeToStatus, mergeStatus } from "./diffGitStatus.js";
import type { RenderedFileDiff } from "./diffRender.js";
import type { DiffFileSummary, DiffSummary } from "./diffTypes.js";

/**
 * Build one file's summary entry directly from its `DiffChange` and rendered blob-diff —
 * counts and binary detection come from the same line-diff pass `getDiff` uses, so the
 * two can never disagree (unlike git's separate `--numstat`/`--name-status` passes).
 */
export function buildFileSummary(
  change: DiffChange,
  rendered: RenderedFileDiff,
): DiffFileSummary {
  const isRenameOrCopy = change.type === "rename" || change.type === "copy";
  return {
    path: rendered.path,
    status: mapChangeTypeToStatus(change.type),
    additions: rendered.added,
    deletions: rendered.deleted,
    oldPath: isRenameOrCopy ? rendered.oldPath : undefined,
    newPath: isRenameOrCopy ? rendered.newPath : undefined,
    binary: rendered.binary ? true : undefined,
  };
}

/**
 * Merge summary entries sharing the same post-change path — needed when `filterByCommits`
 * aggregates several commits' changes into one summary and the same file was touched more
 * than once (git's own numstat/name-status text has the same duplicate-line shape).
 */
export function mergeFileSummariesByPath(
  entries: DiffFileSummary[],
): DiffFileSummary[] {
  const byPath = new Map<string, DiffFileSummary>();
  for (const entry of entries) {
    const existing = byPath.get(entry.path);
    if (!existing) {
      byPath.set(entry.path, { ...entry });
      continue;
    }
    existing.additions += entry.additions;
    existing.deletions += entry.deletions;
    existing.status = mergeStatus(existing.status, entry.status);
    // Stryker disable next-line ConditionalExpression
    if (entry.oldPath) existing.oldPath = existing.oldPath ?? entry.oldPath;
    // Stryker disable next-line ConditionalExpression
    if (entry.newPath) existing.newPath = existing.newPath ?? entry.newPath;
    // Stryker disable next-line ConditionalExpression
    if (entry.binary) existing.binary = true;
  }
  return [...byPath.values()];
}

export function summarizeFiles(files: DiffFileSummary[]): DiffSummary {
  return {
    files,
    totalFiles: files.length,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
  };
}
