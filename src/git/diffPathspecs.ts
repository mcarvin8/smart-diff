import { resolve, relative } from "node:path";

import type { DiffPathFilter } from "./diffTypes.js";

function normalizeRepoRelativePath(p: string): string {
  const trimmed = p.trim().replace(/\\/g, "/");
  const noLeading = trimmed.replace(/^\/+/, "");
  const noTrailingSlash = noLeading.replace(/\/+$/, "");
  return noTrailingSlash.length > 0 ? noTrailingSlash : ".";
}

function assertPathUnderRepo(repoRoot: string, userPath: string): void {
  const abs = resolve(repoRoot, userPath);
  const rel = relative(repoRoot, abs);
  if (rel === "..") {
    throw new Error(
      `Path escapes repository root: ${JSON.stringify(userPath)}`,
    );
  }
  const segments = rel.split(/[/\\]/);
  if (segments.includes("..")) {
    throw new Error(
      `Path escapes repository root: ${JSON.stringify(userPath)}`,
    );
  }
}

/**
 * Build git pathspec arguments: include paths plus `:(exclude)…` entries.
 * Paths are relative to the repository root using forward slashes, as users see them in the repo tree.
 */
export function buildDiffPathspecs(
  repoRoot: string,
  pathFilter?: DiffPathFilter,
): string[] {
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

  const specs: string[] = [];
  if (includes.length === 0) {
    specs.push(".");
  } else {
    for (const inc of includes) {
      specs.push(inc);
    }
  }
  for (const exc of excludes) {
    specs.push(`:(exclude)${exc}`);
  }
  return specs;
}
