import { resolve, relative } from 'node:path';
import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';

export type CommitInfo = {
  hash: string;
  message: string;
};

export type DiffStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied' | 'type-changed' | 'unknown';

export type DiffFileSummary = {
  path: string;
  status: DiffStatus;
  additions: number;
  deletions: number;
  oldPath?: string;
  newPath?: string;
};

export type DiffSummary = {
  files: DiffFileSummary[];
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
};

/** Restrict or exclude paths for `git diff` / `git show`, relative to repository root as users see them (e.g. `src`, `node_modules`). */
export type DiffPathFilter = {
  /** If set and non-empty, only these paths (under the repo root) are included. If omitted or empty, the whole repository is included (subject to `excludeFolders`). */
  includeFolders?: string[];
  /** Paths under the repo root excluded from the diff (git `:(exclude)` pathspecs). */
  excludeFolders?: string[];
};

export function createGitClient(cwd = process.cwd()): SimpleGit {
  return simpleGit(cwd);
}

export async function getCommits(git: SimpleGit, from: string, to: string): Promise<CommitInfo[]> {
  const logResult = await git.log({ from, to });
  return logResult.all as unknown as CommitInfo[];
}

function compileRegex(pattern: string, label: string): RegExp {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    throw new Error(`Invalid ${label} regular expression: ${JSON.stringify(pattern)}`);
  }
}

function commitMessagePassesFilters(message: string, includeRes: RegExp[], excludeRes: RegExp[]): boolean {
  for (const ex of excludeRes) {
    if (ex.test(message)) return false;
  }
  if (includeRes.length > 0 && !includeRes.some((r) => r.test(message))) return false;
  return true;
}

/**
 * Filter commits by message. Excludes are applied first; then if `includePatterns` is non-empty,
 * the message must match at least one include pattern.
 */
export function filterCommitsByMessageRegexes(
  commits: CommitInfo[],
  includePatterns?: string[],
  excludePatterns?: string[]
): CommitInfo[] {
  const includes = (includePatterns ?? []).map((p) => p.trim()).filter((p) => p.length > 0);
  const excludes = (excludePatterns ?? []).map((p) => p.trim()).filter((p) => p.length > 0);

  const includeRes = includes.map((p, i) => compileRegex(p, `commit message include pattern[${i}]`));
  const excludeRes = excludes.map((p, i) => compileRegex(p, `commit message exclude pattern[${i}]`));

  return commits.filter((c) => commitMessagePassesFilters(c.message, includeRes, excludeRes));
}

export async function getRepoRoot(git: SimpleGit): Promise<string> {
  const root = await git.revparse(['--show-toplevel']);
  return root.trim();
}

function normalizeRepoRelativePath(p: string): string {
  const trimmed = p.trim().replace(/\\/g, '/');
  const noLeading = trimmed.replace(/^\/+/, '');
  const noTrailingSlash = noLeading.replace(/\/+$/, '');
  return noTrailingSlash.length > 0 ? noTrailingSlash : '.';
}

function assertPathUnderRepo(repoRoot: string, userPath: string): void {
  const abs = resolve(repoRoot, userPath);
  const rel = relative(repoRoot, abs);
  if (rel === '..') {
    throw new Error(`Path escapes repository root: ${JSON.stringify(userPath)}`);
  }
  const segments = rel.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new Error(`Path escapes repository root: ${JSON.stringify(userPath)}`);
  }
}

/**
 * Build git pathspec arguments: include paths plus `:(exclude)…` entries.
 * Paths are relative to the repository root using forward slashes, as users see them in the repo tree.
 */
export function buildDiffPathspecs(repoRoot: string, pathFilter?: DiffPathFilter): string[] {
  const includeRaw = pathFilter?.includeFolders?.filter((p) => p.trim().length > 0) ?? [];
  const excludeRaw = pathFilter?.excludeFolders?.filter((p) => p.trim().length > 0) ?? [];

  const includes = includeRaw.map(normalizeRepoRelativePath).filter((p) => p !== '.' && p !== '');
  const excludes = excludeRaw.map(normalizeRepoRelativePath).filter((p) => p !== '.' && p !== '');

  const toValidate = includes.length > 0 ? includes : ['.'];
  for (const inc of toValidate) {
    assertPathUnderRepo(repoRoot, inc);
  }
  for (const exc of excludes) {
    assertPathUnderRepo(repoRoot, exc);
  }

  const specs: string[] = [];
  if (includes.length === 0) {
    specs.push('.');
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

type DiffPathContext = {
  repoRoot: string;
  specs: string[];
};

async function getDiffPathContext(git: SimpleGit, pathFilter: DiffPathFilter | undefined, repoRootOverride?: string): Promise<DiffPathContext> {
  const repoRoot = repoRootOverride ?? (await getRepoRoot(git));
  const specs = buildDiffPathspecs(repoRoot, pathFilter);
  return { repoRoot, specs };
}

export async function getDiff(
  git: SimpleGit,
  from: string,
  to: string,
  commits: CommitInfo[],
  filterByCommits: boolean,
  pathFilter?: DiffPathFilter,
  repoRootOverride?: string
): Promise<string> {
  const { specs } = await getDiffPathContext(git, pathFilter, repoRootOverride);

  if (!filterByCommits) {
    return git.diff([`${from}..${to}`, '--', ...specs]);
  }

  const patches = await Promise.all(commits.map((c) => git.diff([`${c.hash}^!`, '--', ...specs])));

  return patches.filter(Boolean).join('\n');
}

export async function getDiffSummary(
  git: SimpleGit,
  from: string,
  to: string,
  commits: CommitInfo[],
  filterByCommits: boolean,
  pathFilter?: DiffPathFilter,
  repoRootOverride?: string
): Promise<DiffSummary> {
  const { specs } = await getDiffPathContext(git, pathFilter, repoRootOverride);

  if (!filterByCommits) {
    const [numOutput, nameOutput] = await Promise.all([
      git.diff(['--numstat', `${from}..${to}`, '--', ...specs]),
      git.diff(['--name-status', `${from}..${to}`, '--', ...specs]),
    ]);
    return buildDiffSummaryFromGitOutputs(nameOutput, numOutput);
  }

  const pairs = await Promise.all(
    commits.map(async (c) => {
      const range = `${c.hash}^!`;
      const [numOutput, nameOutput] = await Promise.all([
        git.diff(['--numstat', range, '--', ...specs]),
        git.diff(['--name-status', range, '--', ...specs]),
      ]);
      return { numOutput, nameOutput };
    })
  );
  const nameJoined = pairs
    .map((p) => p.nameOutput)
    .filter(Boolean)
    .join('\n');
  const numJoined = pairs
    .map((p) => p.numOutput)
    .filter(Boolean)
    .join('\n');
  return buildDiffSummaryFromGitOutputs(nameJoined, numJoined);
}

export async function getChangedFiles(
  git: SimpleGit,
  from: string,
  to: string,
  commits: CommitInfo[],
  filterByCommits: boolean,
  pathFilter?: DiffPathFilter,
  repoRootOverride?: string
): Promise<string[]> {
  const { specs } = await getDiffPathContext(git, pathFilter, repoRootOverride);

  if (!filterByCommits) {
    const output = await git.diff(['--name-only', `${from}..${to}`, '--', ...specs]);

    return output
      .split(/\r?\n/)
      .map((f) => f.trim())
      .filter(Boolean);
  }

  const fileSet = new Set<string>();

  await Promise.all(
    commits.map(async (c) => {
      const output = await git.show(['--name-only', '--pretty=format:', c.hash, '--', ...specs]);

      output
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter(Boolean)
        .forEach((f) => fileSet.add(f));
    })
  );

  return Array.from(fileSet);
}

/** First character of git name-status / synthetic tokens (e.g. R100 → R). */
const GIT_STATUS_BY_FIRST_CHAR: Record<string, DiffStatus> = {
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'type-changed',
  M: 'modified',
};

function mapGitStatus(statusCode: string): DiffStatus {
  return GIT_STATUS_BY_FIRST_CHAR[statusCode.charAt(0)] ?? 'unknown';
}

function mergeStatus(existing: DiffStatus, next: DiffStatus): DiffStatus {
  if (existing === next) return existing;
  const precedence: DiffStatus[] = ['deleted', 'added', 'renamed', 'copied', 'type-changed', 'modified', 'unknown'];
  return precedence.indexOf(existing) <= precedence.indexOf(next) ? existing : next;
}

type ParsedNameEntry = {
  path: string;
  status: DiffStatus;
  oldPath?: string;
};

function parseNameStatusLine(line: string): ParsedNameEntry | null {
  const parts = line.split('\t');
  let entry: ParsedNameEntry | null = null;

  if (parts.length >= 2) {
    const statusToken = parts[0] ?? '';
    const status = mapGitStatus(statusToken);
    const isRenameOrCopy = statusToken.startsWith('R') || statusToken.startsWith('C');

    if (isRenameOrCopy && parts.length >= 3) {
      const oldPath = parts[1];
      const newPath = parts[2];
      if (oldPath !== undefined && newPath !== undefined) {
        entry = { path: newPath, status, oldPath };
      }
    } else if (!isRenameOrCopy) {
      const pathOnly = parts[1];
      if (pathOnly !== undefined) {
        entry = { path: pathOnly, status };
      }
    }
  }

  return entry;
}

function parseNameStatusLines(nameStatusOutput: string): ParsedNameEntry[] {
  const entries: ParsedNameEntry[] = [];
  for (const rawLine of nameStatusOutput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const entry = parseNameStatusLine(line);
    if (entry) entries.push(entry);
  }
  return entries;
}

function mergeNameEntriesByPath(entries: ParsedNameEntry[]): Map<string, ParsedNameEntry> {
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

/** Map numstat path field (including `{old => new}` rename form) to the post-change path used as lookup key. */
function numStatPathToLookupKey(pathField: string): string {
  const brace = /^(.*)\{(.+) => (.+)\}$/.exec(pathField);
  if (!brace) {
    return pathField;
  }
  const dirRaw = brace[1];
  const toSeg = brace[3].trim();
  return `${dirRaw}${toSeg}`;
}

function parseNumStatLine(line: string): { key: string; additions: number; deletions: number } | null {
  const parts = line.split('\t');
  if (parts.length < 3) return null;

  const addStr = parts[0] ?? '';
  const delStr = parts[1] ?? '';
  const pathField = parts.slice(2).join('\t');

  const additions = addStr !== '-' ? Number.parseInt(addStr, 10) || 0 : 0;
  const deletions = delStr !== '-' ? Number.parseInt(delStr, 10) || 0 : 0;

  const key = numStatPathToLookupKey(pathField);
  return { key, additions, deletions };
}

function accumulateNumStat(numStatOutput: string, into: Map<string, { additions: number; deletions: number }>): void {
  for (const rawLine of numStatOutput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parsed = parseNumStatLine(line);
    if (!parsed) continue;
    const prev = into.get(parsed.key) ?? { additions: 0, deletions: 0 };
    into.set(parsed.key, { additions: prev.additions + parsed.additions, deletions: prev.deletions + parsed.deletions });
  }
}

const STATUS_TO_SYNTHETIC_PREFIX: Record<DiffStatus, string> = {
  added: 'A',
  deleted: 'D',
  renamed: 'R100',
  copied: 'C100',
  'type-changed': 'T',
  modified: 'M',
  unknown: 'X',
};

function diffStatusToSyntheticPrefix(status: DiffStatus): string {
  return STATUS_TO_SYNTHETIC_PREFIX[status];
}

function buildSyntheticDiffLine(meta: ParsedNameEntry, counts: { additions: number; deletions: number }): string {
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
function buildDiffSummaryFromGitOutputs(nameStatusOutput: string, numStatOutput: string): DiffSummary {
  const numMap = new Map<string, { additions: number; deletions: number }>();
  accumulateNumStat(numStatOutput, numMap);

  const mergedName = mergeNameEntriesByPath(parseNameStatusLines(nameStatusOutput));
  const syntheticLines: string[] = [];

  for (const [path, meta] of mergedName) {
    const counts = numMap.get(path) ?? { additions: 0, deletions: 0 };
    syntheticLines.push(buildSyntheticDiffLine(meta, counts));
  }

  return parseDiffSummary(syntheticLines.join('\n'));
}

type ParsedDiffSummaryLine = {
  status: DiffStatus;
  additions: number;
  deletions: number;
  oldPath?: string;
  newPath: string;
};

function parseTabDiffSummaryLine(line: string): ParsedDiffSummaryLine | null {
  const parts = line.split('\t');
  if (parts.length < 3) return null;

  const statusToken = parts.shift() ?? '';
  const status = mapGitStatus(statusToken);
  const add0 = parts[0];
  const del0 = parts[1];
  const additions = add0 && add0 !== '-' ? Number.parseInt(add0, 10) || 0 : 0;
  const deletions = del0 && del0 !== '-' ? Number.parseInt(del0, 10) || 0 : 0;

  if (parts.length === 3) {
    return { status, additions, deletions, newPath: parts[2]! };
  }
  if (parts.length === 4) {
    return { status, additions, deletions, oldPath: parts[2], newPath: parts[3]! };
  }
  return null;
}

function mergeParsedDiffSummaryLine(fileMap: Map<string, DiffFileSummary>, p: ParsedDiffSummaryLine): void {
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
