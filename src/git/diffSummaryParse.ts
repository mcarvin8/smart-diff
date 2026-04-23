import type { DiffFileSummary, DiffStatus, DiffSummary } from "./diffTypes.js";
import { mapGitStatus, mergeStatus } from "./diffGitStatus.js";

type ParsedDiffSummaryLine = {
  status: DiffStatus;
  additions: number;
  deletions: number;
  oldPath?: string;
  newPath: string;
};

function parseTabDiffSummaryLine(line: string): ParsedDiffSummaryLine | null {
  const parts = line.split("\t");
  if (parts.length < 3) return null;

  const statusToken = parts.shift()!;
  const status = mapGitStatus(statusToken);
  const add0 = parts[0];
  const del0 = parts[1];
  const additions = add0 && add0 !== "-" ? Number.parseInt(add0, 10) || 0 : 0;
  const deletions = del0 && del0 !== "-" ? Number.parseInt(del0, 10) || 0 : 0;

  if (parts.length === 3) {
    return { status, additions, deletions, newPath: parts[2]! };
  }
  if (parts.length === 4) {
    return {
      status,
      additions,
      deletions,
      oldPath: parts[2],
      newPath: parts[3]!,
    };
  }
  return null;
}

function mergeParsedDiffSummaryLine(
  fileMap: Map<string, DiffFileSummary>,
  p: ParsedDiffSummaryLine,
): void {
  const { newPath, status, additions, deletions, oldPath } = p;
  const existing = fileMap.get(newPath);
  if (existing) {
    existing.additions += additions;
    existing.deletions += deletions;
    existing.status = mergeStatus(existing.status, status);
    if (oldPath) existing.oldPath = existing.oldPath ?? oldPath;
    existing.newPath = existing.newPath ?? newPath;
  } else {
    fileMap.set(newPath, {
      path: newPath,
      status,
      additions,
      deletions,
      oldPath,
      newPath: oldPath ? newPath : undefined,
    });
  }
}

/** Exported for tests; also used to merge synthetic lines when the same path appears more than once. */
export function parseDiffSummary(diffOutput: string): DiffSummary {
  const fileMap = new Map<string, DiffFileSummary>();

  for (const rawLine of diffOutput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const parsed = parseTabDiffSummaryLine(line);
    if (parsed) mergeParsedDiffSummaryLine(fileMap, parsed);
  }

  const files = Array.from(fileMap.values());
  return {
    files,
    totalFiles: files.length,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
}
