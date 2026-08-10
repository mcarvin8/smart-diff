import type { DiffChange, ObjectId, Repository } from "@scolladon/tsgit";
import { openRepository } from "@scolladon/tsgit";
import {
  buildPathFilterPredicate,
  matchesAnyPath,
  type PathFilterPredicate,
} from "./diffPathFilter.js";
import { changePaths, renderUnifiedDiff } from "./diffRender.js";
import { shapeUnifiedDiff } from "./diffShaping.js";
import {
  buildFileSummary,
  mergeFileSummariesByPath,
  summarizeFiles,
} from "./diffSummary.js";
import type {
  CommitInfo,
  DiffSummary,
  GitDiffRangeQuery,
} from "./diffTypes.js";

/** A live `@scolladon/tsgit` repository handle. Dispose with `git.dispose()` when done. */
export type GitClient = Repository;

/** Git's well-known SHA-1 empty-tree object id; tsgit special-cases it without needing the object stored. */
const EMPTY_TREE_OID = "4b825dc642cb6eb9a060e54bf8d69288fbee4904" as ObjectId;

/** Matches `git diff`'s own default context, applied when `shaping.contextLines` is unset. */
const DEFAULT_CONTEXT_LINES = 3;

export async function createGitClient(
  cwd = process.cwd(),
  timeout?: number,
): Promise<GitClient> {
  return openRepository({
    cwd,
    ...(timeout !== undefined ? { signal: AbortSignal.timeout(timeout) } : {}),
  });
}

export async function getRepoRoot(git: GitClient): Promise<string> {
  return git.primitives.getRepoRoot();
}

export async function getCommits(
  git: GitClient,
  from: string,
  to: string,
): Promise<CommitInfo[]> {
  const entries = await git.log({ rev: to, excluding: [from] });
  return entries.map((e) => ({
    hash: e.id,
    message: e.message.split("\n")[0]!,
  }));
}

async function resolveRepoRoot(
  git: GitClient,
  repoRootOverride?: string,
): Promise<string> {
  return repoRootOverride ?? getRepoRoot(git);
}

async function resolveParentTree(
  git: GitClient,
  parentId: ObjectId | undefined,
): Promise<ObjectId> {
  if (parentId === undefined) return EMPTY_TREE_OID;
  const [parentEntry] = await git.log({ rev: parentId, limit: 1 });
  return parentEntry!.tree;
}

async function diffRangeChanges(
  git: GitClient,
  from: string,
  to: string,
  ignoreWhitespace: boolean | undefined,
): Promise<readonly DiffChange[]> {
  const result = await git.diff({
    from,
    to,
    detectRenames: true,
    recursive: true,
    ...(ignoreWhitespace ? { ignoreWhitespace: "all" as const } : {}),
  });
  return result.changes;
}

async function diffCommitChanges(
  git: GitClient,
  hash: string,
  ignoreWhitespace: boolean | undefined,
): Promise<readonly DiffChange[]> {
  const [entry] = await git.log({ rev: hash, limit: 1 });
  const parentTree = await resolveParentTree(git, entry!.parents[0]);
  const result = await git.primitives.diffTrees(parentTree, entry!.tree, {
    detectRenames: true,
    recursive: true,
    ...(ignoreWhitespace ? { ignoreWhitespace: "all" as const } : {}),
  });
  return result.changes;
}

function changeMatchesPathFilter(
  change: DiffChange,
  predicate: PathFilterPredicate,
): boolean {
  const { oldPath, newPath, path } = changePaths(change);
  if (change.type === "rename" || change.type === "copy") {
    return matchesAnyPath(predicate, [oldPath, newPath]);
  }
  return predicate(path);
}

async function collectChanges(
  git: GitClient,
  query: GitDiffRangeQuery,
  predicate: PathFilterPredicate,
): Promise<readonly DiffChange[][]> {
  const { from, to, commits, filterByCommits, shaping } = query;
  const ignoreWhitespace = shaping?.ignoreWhitespace;

  if (!filterByCommits) {
    const changes = await diffRangeChanges(git, from, to, ignoreWhitespace);
    return [changes.filter((c) => changeMatchesPathFilter(c, predicate))];
  }

  return Promise.all(
    commits.map(async (c) => {
      const changes = await diffCommitChanges(git, c.hash, ignoreWhitespace);
      return changes.filter((ch) => changeMatchesPathFilter(ch, predicate));
    }),
  );
}

export async function getDiff(
  git: GitClient,
  query: GitDiffRangeQuery,
): Promise<string> {
  const { pathFilter, repoRootOverride, shaping } = query;
  const repoRoot = await resolveRepoRoot(git, repoRootOverride);
  const predicate = buildPathFilterPredicate(repoRoot, pathFilter);
  const contextLines = shaping?.contextLines ?? DEFAULT_CONTEXT_LINES;

  const changeGroups = await collectChanges(git, query, predicate);
  const patches = await Promise.all(
    changeGroups.map(async (changes) => {
      const rendered = await renderUnifiedDiff(git, changes, contextLines);
      const text = rendered
        .map((r) => r.text)
        .filter(Boolean)
        .join("\n");
      return shapeUnifiedDiff(text, shaping);
    }),
  );
  return patches.filter(Boolean).join("\n");
}

export async function getDiffSummary(
  git: GitClient,
  query: GitDiffRangeQuery,
): Promise<DiffSummary> {
  const { pathFilter, repoRootOverride } = query;
  const repoRoot = await resolveRepoRoot(git, repoRootOverride);
  const predicate = buildPathFilterPredicate(repoRoot, pathFilter);

  const changeGroups = await collectChanges(git, query, predicate);
  const fileGroups = await Promise.all(
    changeGroups.map(async (changes) => {
      const rendered = await renderUnifiedDiff(git, changes, 0);
      return changes.map((c, i) => buildFileSummary(c, rendered[i]!));
    }),
  );
  const files =
    changeGroups.length > 1
      ? mergeFileSummariesByPath(fileGroups.flat())
      : fileGroups.flat();
  return summarizeFiles(files);
}

export async function getChangedFiles(
  git: GitClient,
  query: GitDiffRangeQuery,
): Promise<string[]> {
  const { pathFilter, repoRootOverride } = query;
  const repoRoot = await resolveRepoRoot(git, repoRootOverride);
  const predicate = buildPathFilterPredicate(repoRoot, pathFilter);

  const changeGroups = await collectChanges(git, query, predicate);
  const paths = changeGroups.flat().map((c) => changePaths(c).path);
  return [...new Set(paths)].sort();
}
