import { simpleGit } from "simple-git";
import type { SimpleGit } from "simple-git";

import type {
  CommitInfo,
  DiffPathFilter,
  DiffSummary,
  GitDiffRangeQuery,
} from "./diffTypes.js";
import { buildDiffPathspecs } from "./diffPathspecs.js";
import { buildDiffSummaryFromGitOutputs } from "./diffSummaryBuild.js";

export function createGitClient(cwd = process.cwd()): SimpleGit {
  return simpleGit(cwd);
}

export async function getCommits(
  git: SimpleGit,
  from: string,
  to: string,
): Promise<CommitInfo[]> {
  const logResult = await git.log({ from, to });
  return logResult.all as unknown as CommitInfo[];
}

export async function getRepoRoot(git: SimpleGit): Promise<string> {
  const root = await git.revparse(["--show-toplevel"]);
  return root.trim();
}

type DiffPathContext = {
  repoRoot: string;
  specs: string[];
};

async function getDiffPathContext(
  git: SimpleGit,
  pathFilter: DiffPathFilter | undefined,
  repoRootOverride?: string,
): Promise<DiffPathContext> {
  const repoRoot = repoRootOverride ?? (await getRepoRoot(git));
  const specs = buildDiffPathspecs(repoRoot, pathFilter);
  return { repoRoot, specs };
}

export async function getDiff(
  git: SimpleGit,
  query: GitDiffRangeQuery,
): Promise<string> {
  const { from, to, commits, filterByCommits, pathFilter, repoRootOverride } =
    query;
  const { specs } = await getDiffPathContext(git, pathFilter, repoRootOverride);

  if (!filterByCommits) {
    return git.diff([`${from}..${to}`, "--", ...specs]);
  }

  const patches = await Promise.all(
    commits.map((c) => git.diff([`${c.hash}^!`, "--", ...specs])),
  );

  return patches.filter(Boolean).join("\n");
}

export async function getDiffSummary(
  git: SimpleGit,
  query: GitDiffRangeQuery,
): Promise<DiffSummary> {
  const { from, to, commits, filterByCommits, pathFilter, repoRootOverride } =
    query;
  const { specs } = await getDiffPathContext(git, pathFilter, repoRootOverride);

  if (!filterByCommits) {
    const [numOutput, nameOutput] = await Promise.all([
      git.diff(["--numstat", `${from}..${to}`, "--", ...specs]),
      git.diff(["--name-status", `${from}..${to}`, "--", ...specs]),
    ]);
    return buildDiffSummaryFromGitOutputs(nameOutput, numOutput);
  }

  const pairs = await Promise.all(
    commits.map(async (c) => {
      const range = `${c.hash}^!`;
      const [numOutput, nameOutput] = await Promise.all([
        git.diff(["--numstat", range, "--", ...specs]),
        git.diff(["--name-status", range, "--", ...specs]),
      ]);
      return { numOutput, nameOutput };
    }),
  );
  const nameJoined = pairs
    .map((p) => p.nameOutput)
    .filter(Boolean)
    .join("\n");
  const numJoined = pairs
    .map((p) => p.numOutput)
    .filter(Boolean)
    .join("\n");
  return buildDiffSummaryFromGitOutputs(nameJoined, numJoined);
}

export async function getChangedFiles(
  git: SimpleGit,
  query: GitDiffRangeQuery,
): Promise<string[]> {
  const { from, to, commits, filterByCommits, pathFilter, repoRootOverride } =
    query;
  const { specs } = await getDiffPathContext(git, pathFilter, repoRootOverride);

  if (!filterByCommits) {
    const output = await git.diff([
      "--name-only",
      `${from}..${to}`,
      "--",
      ...specs,
    ]);

    return output
      .split(/\r?\n/)
      .map((f) => f.trim())
      .filter(Boolean);
  }

  const fileSet = new Set<string>();

  await Promise.all(
    commits.map(async (c) => {
      const output = await git.show([
        "--name-only",
        "--pretty=format:",
        c.hash,
        "--",
        ...specs,
      ]);

      output
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter(Boolean)
        .forEach((f) => fileSet.add(f));
    }),
  );

  return Array.from(fileSet);
}
