import { realpathSync } from "node:fs";
import {
  createGitClient,
  type GitClient,
  getChangedFiles,
  getCommits,
  getDiff,
  getDiffSummary,
  getRepoRoot,
} from "../src/git/gitDiff";
import { createFixtureRepo, type FixtureRepo } from "./helpers/tsgitFixture";

/** Re-normalize both sides at comparison time — belt-and-braces against any
 * platform-specific canonical-path quirk (Windows 8.3 short names, macOS
 * /var -> /private/var) the fixture's own realpath call didn't fully iron out. */
function canonical(p: string): string {
  return realpathSync.native(p);
}

describe("gitDiffOps against a real tsgit repo", () => {
  let fx: FixtureRepo;
  let git: GitClient;

  beforeEach(async () => {
    fx = await createFixtureRepo();
    git = await createGitClient(fx.dir);
  });

  afterEach(async () => {
    await git.dispose();
    await fx.cleanup();
  });

  describe("createGitClient", () => {
    it("defaults cwd to process.cwd when omitted", async () => {
      const cwdGit = await createGitClient();
      await cwdGit.dispose();
    });

    it("accepts a timeout and still opens successfully", async () => {
      const timedGit = await createGitClient(fx.dir, 5000);
      expect(canonical(await getRepoRoot(timedGit))).toBe(canonical(fx.dir));
      await timedGit.dispose();
    });
  });

  describe("getRepoRoot", () => {
    it("returns the repository working-tree root", async () => {
      expect(canonical(await getRepoRoot(git))).toBe(canonical(fx.dir));
    });
  });

  describe("getCommits", () => {
    it("returns commits newest-first with subject-only messages", async () => {
      const c1 = await fx.commit("first\n\nlonger body here", {
        "a.ts": "1\n",
      });
      const c2 = await fx.commit("second", { "a.ts": "2\n" });

      const commits = await getCommits(git, c1, c2);
      expect(commits).toEqual([{ hash: c2, message: "second" }]);
    });

    it("returns every commit in the range for a multi-commit span", async () => {
      const c1 = await fx.commit("c1", { "a.ts": "1\n" });
      const c2 = await fx.commit("c2", { "a.ts": "2\n" });
      const c3 = await fx.commit("c3", { "a.ts": "3\n" });

      const commits = await getCommits(git, c1, c3);
      expect(commits.map((c) => c.hash)).toEqual([c3, c2]);
    });

    it("returns an empty array for an empty range", async () => {
      const c1 = await fx.commit("c1", { "a.ts": "1\n" });
      expect(await getCommits(git, c1, c1)).toEqual([]);
    });
  });

  describe("getDiff — range mode", () => {
    it("renders add, modify, and delete in one document", async () => {
      const c1 = await fx.commit("root", {
        "a.ts": "one\ntwo\nthree\n",
        "b.ts": "keep me\n",
      });
      const c2 = await fx.commit(
        "changes",
        { "a.ts": "one\ntwoo\nthree\n", "c.ts": "new file\n" },
        ["b.ts"],
      );

      const diff = await getDiff(git, {
        from: c1,
        to: c2,
        commits: [],
        filterByCommits: false,
      });

      expect(diff).toContain("diff --git a/a.ts b/a.ts");
      expect(diff).toContain("-two\n+twoo");
      expect(diff).toContain("new file mode 100644");
      expect(diff).toContain("+new file");
      expect(diff).toContain("deleted file mode 100644");
      expect(diff).toContain("-keep me");
    });

    it("detects renames with unchanged content as a single rename entry", async () => {
      const c1 = await fx.commit("root", { "old/name.ts": "same content\n" });
      const c2 = await fx.commit(
        "rename",
        { "new/name.ts": "same content\n" },
        ["old/name.ts"],
      );

      const diff = await getDiff(git, {
        from: c1,
        to: c2,
        commits: [],
        filterByCommits: false,
      });

      expect(diff).toContain("similarity index 100%");
      expect(diff).toContain("rename from old/name.ts");
      expect(diff).toContain("rename to new/name.ts");
      expect(diff).not.toContain("new file mode");
      expect(diff).not.toContain("deleted file mode");
    });

    it("renders a binary change with no hunks", async () => {
      const c1 = await fx.commit("root", {
        "img.bin": Buffer.from([0, 1, 2, 3, 0]),
      });
      const c2 = await fx.commit("update", {
        "img.bin": Buffer.from([0, 9, 9, 9, 0]),
      });

      const diff = await getDiff(git, {
        from: c1,
        to: c2,
        commits: [],
        filterByCommits: false,
      });

      expect(diff).toContain("Binary files a/img.bin and b/img.bin differ");
      expect(diff).not.toContain("@@");
    });

    it("applies includeFolders and excludeFolders", async () => {
      const c1 = await fx.commit("root", {
        "src/keep.ts": "a\n",
        "src/skip.ts": "a\n",
        "docs/readme.md": "a\n",
      });
      const c2 = await fx.commit("edit", {
        "src/keep.ts": "b\n",
        "src/skip.ts": "b\n",
        "docs/readme.md": "b\n",
      });

      const diff = await getDiff(git, {
        from: c1,
        to: c2,
        commits: [],
        filterByCommits: false,
        pathFilter: {
          includeFolders: ["src"],
          excludeFolders: ["src/skip.ts"],
        },
      });

      expect(diff).toContain("src/keep.ts");
      expect(diff).not.toContain("src/skip.ts");
      expect(diff).not.toContain("docs/readme.md");
    });

    it("respects a smaller contextLines by splitting distant hunks", async () => {
      const oldLines = Array.from({ length: 20 }, (_, i) => `l${i}`);
      const newLines = [...oldLines];
      newLines[0] = "CHANGED-0";
      newLines[19] = "CHANGED-19";
      const c1 = await fx.commit("root", {
        "f.ts": `${oldLines.join("\n")}\n`,
      });
      const c2 = await fx.commit("edit", {
        "f.ts": `${newLines.join("\n")}\n`,
      });

      const diff = await getDiff(git, {
        from: c1,
        to: c2,
        commits: [],
        filterByCommits: false,
        shaping: { contextLines: 1 },
      });

      expect(diff.match(/@@/g)?.length).toBe(4); // two hunk headers, 2 lines each
    });

    it("drops a whitespace-only change when ignoreWhitespace is set", async () => {
      const c1 = await fx.commit("root", { "f.ts": "a\nb\n" });
      const c2 = await fx.commit("edit", { "f.ts": "a\nb   \n" });

      const diff = await getDiff(git, {
        from: c1,
        to: c2,
        commits: [],
        filterByCommits: false,
        shaping: { ignoreWhitespace: true },
      });

      expect(diff).toBe("");
    });
  });

  describe("getDiff — per-commit mode", () => {
    it("drops a whitespace-only change when ignoreWhitespace is set", async () => {
      const c1 = await fx.commit("root", { "f.ts": "a\nb\n" });
      const c2 = await fx.commit("edit", { "f.ts": "a\nb   \n" });

      const diff = await getDiff(git, {
        from: c1,
        to: c2,
        commits: [{ hash: c2, message: "edit" }],
        filterByCommits: true,
        shaping: { ignoreWhitespace: true },
      });

      expect(diff).toBe("");
    });

    it("diffs the root commit against the empty tree", async () => {
      const c1 = await fx.commit("root", { "a.ts": "hello\n" });

      const diff = await getDiff(git, {
        from: c1,
        to: c1,
        commits: [{ hash: c1, message: "root" }],
        filterByCommits: true,
      });

      expect(diff).toContain("new file mode 100644");
      expect(diff).toContain("+hello");
    });

    it("joins independent per-commit patches with a newline", async () => {
      const c1 = await fx.commit("root", { "a.ts": "1\n" });
      const c2 = await fx.commit("c2", { "a.ts": "2\n" });
      const c3 = await fx.commit("c3", { "b.ts": "new\n" });

      const diff = await getDiff(git, {
        from: c1,
        to: c3,
        commits: [
          { hash: c2, message: "c2" },
          { hash: c3, message: "c3" },
        ],
        filterByCommits: true,
      });

      expect(diff).toContain("a.ts");
      expect(diff).toContain("b.ts");
      expect(diff.indexOf("a.ts")).toBeLessThan(diff.indexOf("b.ts"));
    });
  });

  describe("getDiffSummary", () => {
    it("summarizes range-mode changes with correct counts and statuses", async () => {
      const c1 = await fx.commit("root", {
        "a.ts": "one\ntwo\n",
        "b.ts": "gone\n",
      });
      const c2 = await fx.commit(
        "edit",
        { "a.ts": "one\ntwoo\n", "c.ts": "new\n" },
        ["b.ts"],
      );

      const summary = await getDiffSummary(git, {
        from: c1,
        to: c2,
        commits: [],
        filterByCommits: false,
      });

      expect(summary.totalFiles).toBe(3);
      expect(summary.files.find((f) => f.path === "a.ts")).toMatchObject({
        status: "modified",
        additions: 1,
        deletions: 1,
      });
      expect(summary.files.find((f) => f.path === "b.ts")).toMatchObject({
        status: "deleted",
        deletions: 1,
      });
      expect(summary.files.find((f) => f.path === "c.ts")).toMatchObject({
        status: "added",
        additions: 1,
      });
    });

    it("marks a binary file summary entry with binary: true and zero counts", async () => {
      const c1 = await fx.commit("root", { "i.bin": Buffer.from([0, 1]) });
      const c2 = await fx.commit("edit", { "i.bin": Buffer.from([0, 2]) });

      const summary = await getDiffSummary(git, {
        from: c1,
        to: c2,
        commits: [],
        filterByCommits: false,
      });

      expect(summary.files[0]).toMatchObject({
        binary: true,
        additions: 0,
        deletions: 0,
      });
    });

    it("aggregates additions/deletions across commits touching the same file", async () => {
      const c1 = await fx.commit("root", { "a.ts": "1\n2\n3\n" });
      const c2 = await fx.commit("edit1", { "a.ts": "1\nX\n3\n" });
      const c3 = await fx.commit("edit2", { "a.ts": "1\nX\nY\n" });

      const summary = await getDiffSummary(git, {
        from: c1,
        to: c3,
        commits: [
          { hash: c2, message: "edit1" },
          { hash: c3, message: "edit2" },
        ],
        filterByCommits: true,
      });

      expect(summary.totalFiles).toBe(1);
      expect(summary.files[0]).toMatchObject({
        path: "a.ts",
        status: "modified",
        additions: 2,
        deletions: 2,
      });
    });
  });

  describe("getChangedFiles", () => {
    it("returns a sorted, deduped file list in range mode", async () => {
      const c1 = await fx.commit("root", { "z.ts": "1\n", "a.ts": "1\n" });
      const c2 = await fx.commit("edit", { "z.ts": "2\n", "a.ts": "2\n" });

      const files = await getChangedFiles(git, {
        from: c1,
        to: c2,
        commits: [],
        filterByCommits: false,
      });

      expect(files).toEqual(["a.ts", "z.ts"]);
    });

    it("dedupes a file touched by multiple commits in per-commit mode", async () => {
      const c1 = await fx.commit("root", { "a.ts": "1\n" });
      const c2 = await fx.commit("edit1", { "a.ts": "2\n" });
      const c3 = await fx.commit("edit2", { "a.ts": "3\n", "b.ts": "1\n" });

      const files = await getChangedFiles(git, {
        from: c1,
        to: c3,
        commits: [
          { hash: c2, message: "edit1" },
          { hash: c3, message: "edit2" },
        ],
        filterByCommits: true,
      });

      expect(files).toEqual(["a.ts", "b.ts"]);
    });
  });
});
