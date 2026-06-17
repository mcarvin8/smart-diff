import { exec } from "dugite";

import type {
  CommitInfo,
  DiffPathFilter,
  DiffSummary,
  GitDiffRangeQuery,
} from "./diffTypes.js";
import { buildDiffPathspecs } from "./diffPathspecs.js";
import { buildDiffShapingGitArgs, shapeUnifiedDiff } from "./diffShaping.js";
import { buildDiffSummaryFromGitOutputs } from "./diffSummaryBuild.js";

export type GitClient = {
  run(args: string[]): Promise<string>;
};

export function createGitClient(
  cwd = process.cwd(),
  timeout?: number,
): GitClient {
  return {
    run: async (args) => {
      const result = await exec(args, cwd, {
        ...(timeout !== undefined
          ? { signal: AbortSignal.timeout(timeout) }
          : {}),
      });
      if (result.exitCode !== 0) {
        throw new Error(
          result.stderr || `git exited with code ${result.exitCode}`,
        );
      }
      return result.stdout;
    },
  };
}

export async function getCommits(
  git: GitClient,
  from: string,
  to: string,
): Promise<CommitInfo[]> {
  const output = await git.run(["log", "--format=%H%x1f%s", `${from}..${to}`]);
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const sep = line.indexOf("\x1f");
      return {
        hash: sep >= 0 ? line.slice(0, sep) : line,
        message: sep >= 0 ? line.slice(sep + 1) : "",
      };
    });
}

export async function getRepoRoot(git: GitClient): Promise<string> {
  const root = await git.run(["rev-parse", "--show-toplevel"]);
  return root.trim();
}

type DiffPathContext = {
  repoRoot: string;
  specs: string[];
};

async function getDiffPathContext(
  git: GitClient,
  pathFilter: DiffPathFilter | undefined,
  repoRootOverride?: string,
): Promise<DiffPathContext> {
  const repoRoot = repoRootOverride ?? (await getRepoRoot(git));
  const specs = buildDiffPathspecs(repoRoot, pathFilter);
  return { repoRoot, specs };
}

export async function getDiff(
  git: GitClient,
  query: GitDiffRangeQuery,
): Promise<string> {
  const {
    from,
    to,
    commits,
    filterByCommits,
    pathFilter,
    repoRootOverride,
    shaping,
  } = query;
  const { specs } = await getDiffPathContext(git, pathFilter, repoRootOverride);
  const shapingArgs = buildDiffShapingGitArgs(shaping);

  if (!filterByCommits) {
    const raw = await git.run([
      "diff",
      ...shapingArgs,
      `${from}..${to}`,
      "--",
      ...specs,
    ]);
    return shapeUnifiedDiff(raw, shaping);
  }

  const patches = await Promise.all(
    commits.map((c) =>
      git.run(["diff", ...shapingArgs, `${c.hash}^!`, "--", ...specs]),
    ),
  );

  return patches
    .map((p) => shapeUnifiedDiff(p, shaping))
    .filter(Boolean)
    .join("\n");
}

export async function getDiffSummary(
  git: GitClient,
  query: GitDiffRangeQuery,
): Promise<DiffSummary> {
  const {
    from,
    to,
    commits,
    filterByCommits,
    pathFilter,
    repoRootOverride,
    shaping,
  } = query;
  const { specs } = await getDiffPathContext(git, pathFilter, repoRootOverride);
  const whitespaceArgs = shaping?.ignoreWhitespace ? ["-w"] : [];

  if (!filterByCommits) {
    const [numOutput, nameOutput] = await Promise.all([
      git.run([
        "diff",
        ...whitespaceArgs,
        "--numstat",
        `${from}..${to}`,
        "--",
        ...specs,
      ]),
      git.run([
        "diff",
        ...whitespaceArgs,
        "--name-status",
        `${from}..${to}`,
        "--",
        ...specs,
      ]),
    ]);
    return buildDiffSummaryFromGitOutputs(nameOutput, numOutput);
  }

  const pairs = await Promise.all(
    commits.map(async (c) => {
      const range = `${c.hash}^!`;
      const [numOutput, nameOutput] = await Promise.all([
        git.run([
          "diff",
          ...whitespaceArgs,
          "--numstat",
          range,
          "--",
          ...specs,
        ]),
        git.run([
          "diff",
          ...whitespaceArgs,
          "--name-status",
          range,
          "--",
          ...specs,
        ]),
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
  git: GitClient,
  query: GitDiffRangeQuery,
): Promise<string[]> {
  const { from, to, commits, filterByCommits, pathFilter, repoRootOverride } =
    query;
  const { specs } = await getDiffPathContext(git, pathFilter, repoRootOverride);

  if (!filterByCommits) {
    const output = await git.run([
      "diff",
      "--name-only",
      `${from}..${to}`,
      "--",
      ...specs,
    ]);

    return output
      .split(/\r?\n/)
      .map((f) => f.trim())
      .filter(Boolean)
      .sort();
  }

  const results = await Promise.all(
    commits.map(async (c) => {
      const output = await git.run([
        "show",
        "--name-only",
        "--pretty=format:",
        c.hash,
        "--",
        ...specs,
      ]);
      return output
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter(Boolean);
    }),
  );

  return [...new Set(results.flat())].sort();
}
