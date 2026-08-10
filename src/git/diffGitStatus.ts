import type { DiffChangeType } from "@scolladon/tsgit";

import type { DiffStatus } from "./diffTypes.js";

const CHANGE_TYPE_TO_STATUS: Record<DiffChangeType, DiffStatus> = {
  add: "added",
  delete: "deleted",
  rename: "renamed",
  copy: "copied",
  "type-change": "type-changed",
  modify: "modified",
};

export function mapChangeTypeToStatus(type: DiffChangeType): DiffStatus {
  return CHANGE_TYPE_TO_STATUS[type];
}

export function mergeStatus(
  existing: DiffStatus,
  next: DiffStatus,
): DiffStatus {
  // Stryker disable next-line ConditionalExpression
  if (existing === next) return existing;
  const precedence: DiffStatus[] = [
    // Stryker disable next-line StringLiteral
    "deleted",
    "added",
    "renamed",
    "copied",
    "type-changed",
    "modified",
    "unknown",
  ];
  // Stryker disable next-line EqualityOperator
  return precedence.indexOf(existing) <= precedence.indexOf(next)
    ? existing
    : next;
}
