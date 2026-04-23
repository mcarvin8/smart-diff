import type { DiffStatus } from "./diffTypes.js";
import { mapGitStatus, mergeStatus } from "./diffGitStatus.js";

export type ParsedNameEntry = {
  path: string;
  status: DiffStatus;
  oldPath?: string;
};

function parseNameStatusLine(line: string): ParsedNameEntry | null {
  const parts = line.split("\t");
  let entry: ParsedNameEntry | null = null;

  if (parts.length >= 2) {
    const statusToken = parts[0]!;
    const status = mapGitStatus(statusToken);
    const isRenameOrCopy =
      statusToken.startsWith("R") || statusToken.startsWith("C");

    if (isRenameOrCopy && parts.length >= 3) {
      entry = { path: parts[2]!, status, oldPath: parts[1]! };
    } else if (!isRenameOrCopy) {
      entry = { path: parts[1]!, status };
    }
  }

  return entry;
}

export function parseNameStatusLines(
  nameStatusOutput: string,
): ParsedNameEntry[] {
  const entries: ParsedNameEntry[] = [];
  for (const rawLine of nameStatusOutput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const entry = parseNameStatusLine(line);
    if (entry) entries.push(entry);
  }
  return entries;
}

export function mergeNameEntriesByPath(
  entries: ParsedNameEntry[],
): Map<string, ParsedNameEntry> {
  const byPath = new Map<string, ParsedNameEntry>();
  for (const e of entries) {
    const existing = byPath.get(e.path);
    if (!existing) {
      byPath.set(e.path, { ...e });
    } else {
      existing.status = mergeStatus(existing.status, e.status);
      if (e.oldPath) {
        existing.oldPath = existing.oldPath ?? e.oldPath;
      }
    }
  }
  return byPath;
}
