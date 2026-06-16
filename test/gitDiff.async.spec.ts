import { join } from "node:path";
import type { Mock } from "vitest";

import {
  createGitClient,
  getChangedFiles,
  getCommits,
  getDiff,
  getDiffSummary,
  getRepoRoot,
  type CommitInfo,
  type GitClient,
} from "../src/git/gitDiff";

function makeGit(
  impl: (args: string[]) => Promise<string> = () => Promise.resolve(""),
): GitClient & { run: Mock } {
  return { run: vi.fn().mockImplementation(impl) };
}

describe("createGitClient", () => {
  it("returns a GitClient with a run function for the given cwd", () => {
    const git = createGitClient(join(__dirname, ".."));
    expect(git).toBeDefined();
    expect(typeof git.run).toBe("function");
  });

  it("defaults cwd to process.cwd when omitted", () => {
    const git = createGitClient();
    expect(git).toBeDefined();
  });
});

describe("getRepoRoot", () => {
  it("trims rev-parse output", async () => {
    const git = makeGit(() => Promise.resolve("  /repo/root  \n"));
    await expect(getRepoRoot(git)).resolves.toBe("/repo/root");
  });
});

describe("getCommits", () => {
  it("returns parsed log output as CommitInfo[]", async () => {
    const git = makeGit(() => Promise.resolve("aaa\x1fmsg\n"));
    await expect(getCommits(git, "from", "to")).resolves.toEqual([
      { hash: "aaa", message: "msg" },
    ]);
    expect(git.run).toHaveBeenCalledWith([
      "log",
      "--format=%H%x1f%s",
      "from..to",
    ]);
  });
});

function makeGitWithDiff(): { git: GitClient & { run: Mock }; run: Mock } {
  const run = vi.fn().mockImplementation(async (args: string[]) => {
    if (args[0] === "rev-parse") {
      return `${join(__dirname, "fixture-repo")}\n`;
    }
    return "";
  });
  const git = { run };
  return { git, run };
}

describe("getDiff", () => {
  it("uses range diff and repoRootOverride skips rev-parse", async () => {
    const { git, run } = makeGitWithDiff();
    run.mockResolvedValue("range-diff");
    const commits: CommitInfo[] = [{ hash: "x", message: "m" }];

    const out = await getDiff(git, {
      from: "a",
      to: "b",
      commits,
      filterByCommits: false,
      pathFilter: { excludeFolders: ["out"] },
      repoRootOverride: join(__dirname, "fixture-repo"),
    });

    expect(out).toBe("range-diff");
    expect(run).toHaveBeenCalledWith([
      "diff",
      "a..b",
      "--",
      ".",
      ":(exclude)out",
    ]);
    const revParseCalled = run.mock.calls.some(
      (c: string[][]) => c[0][0] === "rev-parse",
    );
    expect(revParseCalled).toBe(false);
  });

  it("forwards shaping args and post-processes the range diff", async () => {
    const { git, run } = makeGitWithDiff();
    run.mockResolvedValue(
      [
        "diff --git a/a.ts b/a.ts",
        "index 111..222 100644",
        "--- a/a.ts",
        "+++ b/a.ts",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new",
      ].join("\n"),
    );

    const out = await getDiff(git, {
      from: "a",
      to: "b",
      commits: [{ hash: "x", message: "m" }],
      filterByCommits: false,
      repoRootOverride: join(__dirname, "fixture-repo"),
      shaping: {
        contextLines: 1,
        ignoreWhitespace: true,
        stripDiffPreamble: true,
      },
    });

    expect(run).toHaveBeenCalledWith(["diff", "-U1", "-w", "a..b", "--", "."]);
    expect(out).not.toContain("diff --git");
    expect(out).not.toContain("index 111..222");
    expect(out).toContain("--- a/a.ts");
    expect(out).toContain("@@ -1,1 +1,1 @@");
  });

  it("shapes each per-commit patch independently", async () => {
    const { git, run } = makeGitWithDiff();
    run
      .mockResolvedValueOnce(
        [
          "diff --git a/a.ts b/a.ts",
          "index 111..222 100644",
          "--- a/a.ts",
          "+++ b/a.ts",
          "@@ -1,1 +1,1 @@",
          "-a",
          "+b",
        ].join("\n"),
      )
      .mockResolvedValueOnce("");

    const out = await getDiff(git, {
      from: "f",
      to: "t",
      commits: [
        { hash: "aaa", message: "1" },
        { hash: "bbb", message: "2" },
      ],
      filterByCommits: true,
      repoRootOverride: join(__dirname, "fixture-repo"),
      shaping: { stripDiffPreamble: true, contextLines: 0 },
    });

    expect(run).toHaveBeenCalledWith(["diff", "-U0", "aaa^!", "--", "."]);
    expect(run).toHaveBeenCalledWith(["diff", "-U0", "bbb^!", "--", "."]);
    expect(out).not.toContain("diff --git");
    expect(out).toContain("--- a/a.ts");
  });

  it("joins per-commit patches and drops empty", async () => {
    const { git, run } = makeGitWithDiff();
    run.mockResolvedValueOnce("").mockResolvedValueOnce("patch-b");
    const commits: CommitInfo[] = [
      { hash: "aaa111", message: "a" },
      { hash: "bbb222", message: "b" },
    ];

    const out = await getDiff(git, {
      from: "f",
      to: "t",
      commits,
      filterByCommits: true,
      repoRootOverride: join(__dirname, "fixture-repo"),
    });

    expect(run).toHaveBeenCalledWith(["diff", "aaa111^!", "--", "."]);
    expect(run).toHaveBeenCalledWith(["diff", "bbb222^!", "--", "."]);
    expect(out).toBe("patch-b");
  });
});

describe("getDiffSummary", () => {
  it("aggregates range numstat and name-status", async () => {
    const { git, run } = makeGitWithDiff();
    run.mockImplementation(async (args: string[]) => {
      if (args.includes("--numstat")) {
        return [
          "1\t2\tadded.ts",
          "-\t-\tempty",
          "3\t0\tnew/name",
          "1\t1\tdup.ts",
          "2\t0\tprefix{a => b}",
        ].join("\n");
      }
      if (args.includes("--name-status")) {
        return [
          "A\tadded.ts",
          "D\tgone.ts",
          "C100\torig\tcopy.ts",
          "T\ttyped.ext",
          "R100\told/name\tnew/name",
          "M\tdup.ts",
          "M\tdup.ts",
          "M\tprefixb",
          "R99\tonlyonecol",
          "X",
          "??\tunknown.bin",
        ].join("\n");
      }
      return "";
    });

    const summary = await getDiffSummary(git, {
      from: "x",
      to: "y",
      commits: [{ hash: "h", message: "m" }],
      filterByCommits: false,
      repoRootOverride: join(__dirname, "fixture-repo"),
    });

    const paths = new Set(summary.files.map((f) => f.path));
    expect(paths.has("added.ts")).toBe(true);
    expect(paths.has("gone.ts")).toBe(true);
    expect(paths.has("copy.ts")).toBe(true);
    expect(summary.files.find((f) => f.path === "new/name")).toMatchObject({
      status: "renamed",
    });
    expect(summary.files.find((f) => f.path === "prefixb")).toBeDefined();
    expect(summary.files.find((f) => f.path === "unknown.bin")?.status).toBe(
      "unknown",
    );
  });

  it("tolerates malformed numstat lines and non-numeric counts", async () => {
    const { git, run } = makeGitWithDiff();
    run.mockImplementation(async (args: string[]) => {
      if (args.includes("--numstat")) {
        return [
          "single_col_no_tabs",
          "two\tcols",
          "abc\t1\tnonnum.ts",
          "1\tdef\tnonnum2.ts",
        ].join("\n");
      }
      if (args.includes("--name-status")) {
        return ["M\tnonnum.ts", "M\tnonnum2.ts"].join("\n");
      }
      return "";
    });

    const summary = await getDiffSummary(git, {
      from: "x",
      to: "y",
      commits: [{ hash: "h", message: "m" }],
      filterByCommits: false,
      repoRootOverride: join(__dirname, "fixture-repo"),
    });

    expect(summary.files.find((f) => f.path === "nonnum.ts")).toMatchObject({
      additions: 0,
      deletions: 1,
    });
    expect(summary.files.find((f) => f.path === "nonnum2.ts")).toMatchObject({
      additions: 1,
      deletions: 0,
    });
  });

  it("merges multiple renames that target the same new path", async () => {
    const { git, run } = makeGitWithDiff();
    run.mockImplementation(async (args: string[]) => {
      if (args.includes("--numstat")) {
        return "1\t1\tshared.ts";
      }
      if (args.includes("--name-status")) {
        return ["R100\told/a.ts\tshared.ts", "R100\told/b.ts\tshared.ts"].join(
          "\n",
        );
      }
      return "";
    });

    const summary = await getDiffSummary(git, {
      from: "x",
      to: "y",
      commits: [{ hash: "h", message: "m" }],
      filterByCommits: false,
      repoRootOverride: join(__dirname, "fixture-repo"),
    });

    const shared = summary.files.find((f) => f.path === "shared.ts");
    expect(shared?.status).toBe("renamed");
    expect(shared?.oldPath).toBe("old/a.ts");
  });

  it("fills in oldPath when a later rename follows a non-rename entry for the same path", async () => {
    const { git, run } = makeGitWithDiff();
    run.mockImplementation(async (args: string[]) => {
      if (args.includes("--numstat")) {
        return "1\t1\tshared.ts";
      }
      if (args.includes("--name-status")) {
        return ["M\tshared.ts", "R100\told/name.ts\tshared.ts"].join("\n");
      }
      return "";
    });

    const summary = await getDiffSummary(git, {
      from: "x",
      to: "y",
      commits: [{ hash: "h", message: "m" }],
      filterByCommits: false,
      repoRootOverride: join(__dirname, "fixture-repo"),
    });

    const shared = summary.files.find((f) => f.path === "shared.ts");
    expect(shared?.oldPath).toBe("old/name.ts");
  });

  it("passes -w to numstat and name-status when ignoreWhitespace is set", async () => {
    const { git, run } = makeGitWithDiff();
    run.mockResolvedValue("");

    await getDiffSummary(git, {
      from: "a",
      to: "b",
      commits: [{ hash: "h", message: "m" }],
      filterByCommits: false,
      repoRootOverride: join(__dirname, "fixture-repo"),
      shaping: { ignoreWhitespace: true },
    });

    expect(run).toHaveBeenCalledWith([
      "diff",
      "-w",
      "--numstat",
      "a..b",
      "--",
      ".",
    ]);
    expect(run).toHaveBeenCalledWith([
      "diff",
      "-w",
      "--name-status",
      "a..b",
      "--",
      ".",
    ]);
  });

  it("passes -w per-commit when ignoreWhitespace is set with filterByCommits", async () => {
    const { git, run } = makeGitWithDiff();
    run.mockResolvedValue("");

    await getDiffSummary(git, {
      from: "a",
      to: "b",
      commits: [{ hash: "c1", message: "m" }],
      filterByCommits: true,
      repoRootOverride: join(__dirname, "fixture-repo"),
      shaping: { ignoreWhitespace: true },
    });

    expect(run).toHaveBeenCalledWith([
      "diff",
      "-w",
      "--numstat",
      "c1^!",
      "--",
      ".",
    ]);
  });

  it("aggregates per-commit summaries", async () => {
    const { git, run } = makeGitWithDiff();
    run.mockImplementation(async (args: string[]) => {
      const range = args.find((a) => a.endsWith("^!"));
      if (args.includes("--numstat")) {
        return range?.startsWith("111") ? "1\t1\tf.ts" : "";
      }
      if (args.includes("--name-status")) {
        return range?.startsWith("111") ? "M\tf.ts" : "";
      }
      return "";
    });

    const summary = await getDiffSummary(git, {
      from: "a",
      to: "b",
      commits: [
        { hash: "111aaa", message: "m1" },
        { hash: "222bbb", message: "m2" },
      ],
      filterByCommits: true,
      repoRootOverride: join(__dirname, "fixture-repo"),
    });

    expect(summary.files.some((f) => f.path === "f.ts")).toBe(true);
  });
});

describe("getChangedFiles", () => {
  it("splits range output on CRLF", async () => {
    const { git, run } = makeGitWithDiff();
    run.mockResolvedValue("a.ts\r\nb.ts\r\n");

    const files = await getChangedFiles(git, {
      from: "a",
      to: "b",
      commits: [{ hash: "h", message: "m" }],
      filterByCommits: false,
      repoRootOverride: join(__dirname, "fixture-repo"),
    });

    expect(files).toEqual(["a.ts", "b.ts"]);
  });

  it("dedupes files from per-commit show output", async () => {
    const { git, run } = makeGitWithDiff();
    run
      .mockResolvedValueOnce("dup.ts\n")
      .mockResolvedValueOnce("dup.ts\nother.ts\n");

    const files = await getChangedFiles(git, {
      from: "a",
      to: "b",
      commits: [
        { hash: "c1", message: "1" },
        { hash: "c2", message: "2" },
      ],
      filterByCommits: true,
      repoRootOverride: join(__dirname, "fixture-repo"),
    });

    expect(files.sort()).toEqual(["dup.ts", "other.ts"]);
  });
});
