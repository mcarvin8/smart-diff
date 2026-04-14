import type { DiffStatus } from "./diffTypes.js";

/** First character of git name-status / synthetic tokens (e.g. R100 → R). */
const GIT_STATUS_BY_FIRST_CHAR: Record<string, DiffStatus> = {
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type-changed",
  M: "modified",
};

export function mapGitStatus(statusCode: string): DiffStatus {
  return GIT_STATUS_BY_FIRST_CHAR[statusCode.charAt(0)] ?? "unknown";
}

export function mergeStatus(existing: DiffStatus, next: DiffStatus): DiffStatus {
  if (existing === next) return existing;
  const precedence: DiffStatus[] = [
    "deleted",
    "added",
    "renamed",
    "copied",
    "type-changed",
    "modified",
    "unknown",
  ];
  return precedence.indexOf(existing) <= precedence.indexOf(next)
    ? existing
    : next;
}
