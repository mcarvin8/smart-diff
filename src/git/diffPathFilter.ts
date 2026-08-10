import { resolve, sep } from "node:path";

import type { DiffPathFilter } from "./diffTypes.js";

function normalizeRepoRelativePath(p: string): string {
  const trimmed = p.trim().replace(/\\/g, "/");
  const noLeading = trimmed.replace(/^\/+/, "");
  const noTrailingSlash = noLeading.replace(/\/+$/, "");
  return noTrailingSlash.length > 0 ? noTrailingSlash : ".";
}

function assertPathUnderRepo(repoRoot: string, userPath: string): void {
  const absRoot = resolve(repoRoot);
  const abs = resolve(repoRoot, userPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) {
    throw new Error(
      `Path escapes repository root: ${JSON.stringify(userPath)}`,
    );
  }
}

function isUnderOrEqual(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** Repo-root-relative path predicate produced by {@link buildPathFilterPredicate}. */
export type PathFilterPredicate = (path: string) => boolean;

/**
 * Build a predicate over repo-root-relative diff paths, mirroring the directory-prefix
 * semantics of git `:(exclude)` pathspecs (the only pathspec shape this library ever
 * produced — no globs). tsgit's `diff` has no pathspec support, so filtering happens
 * client-side over the returned `DiffChange[]` instead of being passed to git.
 */
export function buildPathFilterPredicate(
  repoRoot: string,
  pathFilter?: DiffPathFilter,
): PathFilterPredicate {
  const includeRaw =
    pathFilter?.includeFolders?.filter((p) => p.trim().length > 0) ?? [];
  const excludeRaw =
    pathFilter?.excludeFolders?.filter((p) => p.trim().length > 0) ?? [];

  const includes = includeRaw
    .map(normalizeRepoRelativePath)
    .filter((p) => p !== "." && p !== "");
  const excludes = excludeRaw
    .map(normalizeRepoRelativePath)
    .filter((p) => p !== "." && p !== "");

  const toValidate = includes.length > 0 ? includes : ["."];
  for (const inc of toValidate) {
    assertPathUnderRepo(repoRoot, inc);
  }
  for (const exc of excludes) {
    assertPathUnderRepo(repoRoot, exc);
  }

  return (path: string): boolean => {
    if (excludes.some((exc) => isUnderOrEqual(path, exc))) return false;
    if (includes.length === 0) return true;
    return includes.some((inc) => isUnderOrEqual(path, inc));
  };
}

/** True when at least one defined candidate path (e.g. a rename's old+new path) passes the predicate. */
export function matchesAnyPath(
  predicate: PathFilterPredicate,
  paths: ReadonlyArray<string | undefined>,
): boolean {
  return paths.some((p) => p !== undefined && predicate(p));
}
