import type { DiffStatus, DiffSummary } from "./diffTypes.js";
import {
  mergeNameEntriesByPath,
  parseNameStatusLines,
  type ParsedNameEntry,
} from "./diffNameStatusParse.js";
import { accumulateNumStat } from "./diffNumstatParse.js";
import { parseDiffSummary } from "./diffSummaryParse.js";

const STATUS_TO_SYNTHETIC_PREFIX: Record<DiffStatus, string> = {
  added: "A",
  deleted: "D",
  renamed: "R100",
  copied: "C100",
  "type-changed": "T",
  modified: "M",
  unknown: "X",
};

function diffStatusToSyntheticPrefix(status: DiffStatus): string {
  return STATUS_TO_SYNTHETIC_PREFIX[status];
}

function buildSyntheticDiffLine(
  meta: ParsedNameEntry,
  counts: { additions: number; deletions: number },
): string {
  const prefix = diffStatusToSyntheticPrefix(meta.status);
  if (meta.oldPath) {
    return `${prefix}\t${counts.additions}\t${counts.deletions}\t${meta.oldPath}\t${meta.path}`;
  }
  return `${prefix}\t${counts.additions}\t${counts.deletions}\t${meta.path}`;
}

/**
 * Git does not combine `--numstat` and `--name-status` into one machine-readable line; using both flags
 * yields name-status only. We run each mode separately and merge into the compact shape `parseDiffSummary` expects.
 */
export function buildDiffSummaryFromGitOutputs(
  nameStatusOutput: string,
  numStatOutput: string,
): DiffSummary {
  const numMap = new Map<string, { additions: number; deletions: number }>();
  accumulateNumStat(numStatOutput, numMap);

  const mergedName = mergeNameEntriesByPath(
    parseNameStatusLines(nameStatusOutput),
  );
  const syntheticLines: string[] = [];

  for (const [path, meta] of mergedName) {
    const counts = numMap.get(path) ?? { additions: 0, deletions: 0 };
    syntheticLines.push(buildSyntheticDiffLine(meta, counts));
  }

  return parseDiffSummary(syntheticLines.join("\n"));
}
