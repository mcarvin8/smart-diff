import { join } from "node:path";
import type { SimpleGit } from "simple-git";

import {
  createGitClient,
  getChangedFiles,
  getCommits,
  getDiff,
  getDiffSummary,
  getRepoRoot,
  type CommitInfo,
} from "../src/git/gitDiff";

describe("createGitClient", () => {
  it("returns a simple-git instance for the given cwd", () => {
    const git = createGitClient(join(__dirname, ".."));
    expect(git).toBeDefined();
    expect(typeof git.log).toBe("function");
  });

  it("defaults cwd to process.cwd when omitted", () => {
    const git = createGitClient();
    expect(git).toBeDefined();
  });
});

describe("getRepoRoot", () => {
  it("trims revparse output", async () => {
    const git = {
      revparse: jest.fn().mockResolvedValue("  /repo/root  \n"),
    } as unknown as SimpleGit;
    await expect(getRepoRoot(git)).resolves.toBe("/repo/root");
  });
});

describe("getCommits", () => {
  it("returns log.all as CommitInfo[]", async () => {
    const git = {
      log: jest.fn().mockResolvedValue({
        all: [{ hash: "aaa", message: "msg" }],
      }),
    } as unknown as SimpleGit;
    await expect(getCommits(git, "from", "to")).resolves.toEqual([
      { hash: "aaa", message: "msg" },
    ]);
    expect(git.log).toHaveBeenCalledWith({ from: "from", to: "to" });
  });
});

function makeGitWithDiff(): { git: SimpleGit; diff: jest.Mock } {
  const diff = jest.fn();
  const git = {
    revparse: jest
      .fn()
      .mockResolvedValue(`${join(__dirname, "fixture-repo")}\n`),
    diff,
    show: jest.fn(),
  } as unknown as SimpleGit;
  return { git, diff };
}

describe("getDiff", () => {
  it("uses range diff and repoRootOverride skips revparse", async () => {
    const { git, diff } = makeGitWithDiff();
    diff.mockResolvedValue("range-diff");
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
    expect(diff).toHaveBeenCalledWith(["a..b", "--", ".", ":(exclude)out"]);
    expect(
      (git as unknown as { revparse: jest.Mock }).revparse,
    ).not.toHaveBeenCalled();
  });

  it("joins per-commit patches and drops empty", async () => {
    const { git, diff } = makeGitWithDiff();
    diff.mockResolvedValueOnce("").mockResolvedValueOnce("patch-b");
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

    expect(diff).toHaveBeenCalledWith(["aaa111^!", "--", "."]);
    expect(diff).toHaveBeenCalledWith(["bbb222^!", "--", "."]);
    expect(out).toBe("patch-b");
  });
});

describe("getDiffSummary", () => {
  it("aggregates range numstat and name-status", async () => {
    const { git, diff } = makeGitWithDiff();
    diff.mockImplementation(async (args: string[]) => {
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
    const { git, diff } = makeGitWithDiff();
    diff.mockImplementation(async (args: string[]) => {
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
    const { git, diff } = makeGitWithDiff();
    diff.mockImplementation(async (args: string[]) => {
      if (args.includes("--numstat")) {
        return "1\t1\tshared.ts";
      }
      if (args.includes("--name-status")) {
        return [
          "R100\told/a.ts\tshared.ts",
          "R100\told/b.ts\tshared.ts",
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

    const shared = summary.files.find((f) => f.path === "shared.ts");
    expect(shared?.status).toBe("renamed");
    expect(shared?.oldPath).toBe("old/a.ts");
  });

  it("fills in oldPath when a later rename follows a non-rename entry for the same path", async () => {
    const { git, diff } = makeGitWithDiff();
    diff.mockImplementation(async (args: string[]) => {
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

  it("aggregates per-commit summaries", async () => {
    const { git, diff } = makeGitWithDiff();
    let call = 0;
    diff.mockImplementation(async (args: string[]) => {
      const range = args.find((a) => a.endsWith("^!"));
      call += 1;
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
    const { git, diff } = makeGitWithDiff();
    diff.mockResolvedValue("a.ts\r\nb.ts\r\n");

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
    const { git } = makeGitWithDiff();
    const show = jest
      .fn()
      .mockResolvedValueOnce("dup.ts\n")
      .mockResolvedValueOnce("dup.ts\nother.ts\n");
    (git as unknown as { show: typeof show }).show = show;

    const files = await getChangedFiles(git as unknown as SimpleGit, {
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
