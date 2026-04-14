import type { CommitInfo } from "./diffTypes.js";

function compileRegex(pattern: string, label: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch {
    throw new Error(
      `Invalid ${label} regular expression: ${JSON.stringify(pattern)}`,
    );
  }
}

function commitMessagePassesFilters(
  message: string,
  includeRes: RegExp[],
  excludeRes: RegExp[],
): boolean {
  for (const ex of excludeRes) {
    if (ex.test(message)) return false;
  }
  if (includeRes.length > 0 && !includeRes.some((r) => r.test(message)))
    return false;
  return true;
}

/**
 * Filter commits by message. Excludes are applied first; then if `includePatterns` is non-empty,
 * the message must match at least one include pattern.
 */
export function filterCommitsByMessageRegexes(
  commits: CommitInfo[],
  includePatterns?: string[],
  excludePatterns?: string[],
): CommitInfo[] {
  const includes = (includePatterns ?? [])
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const excludes = (excludePatterns ?? [])
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const includeRes = includes.map((p, i) =>
    compileRegex(p, `commit message include pattern[${i}]`),
  );
  const excludeRes = excludes.map((p, i) =>
    compileRegex(p, `commit message exclude pattern[${i}]`),
  );

  return commits.filter((c) =>
    commitMessagePassesFilters(c.message, includeRes, excludeRes),
  );
}
