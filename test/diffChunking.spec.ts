import {
  groupDiffChunksByBudget,
  splitUnifiedDiffIntoFileChunks,
} from "../src/ai/diffChunking";

describe("splitUnifiedDiffIntoFileChunks", () => {
  it("returns an empty array for empty input", () => {
    expect(splitUnifiedDiffIntoFileChunks("")).toEqual([]);
  });

  it("returns a single chunk for a diff with one file", () => {
    const diff = [
      "diff --git a/a.ts b/a.ts",
      "index abc..def 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
    ].join("\n");
    expect(splitUnifiedDiffIntoFileChunks(diff)).toEqual([diff]);
  });

  it("splits into one chunk per file using diff --git boundaries", () => {
    const fileA = [
      "diff --git a/a.ts b/a.ts",
      "index abc..def 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
    ].join("\n");
    const fileB = [
      "diff --git a/b.ts b/b.ts",
      "index 111..222 100644",
      "--- a/b.ts",
      "+++ b/b.ts",
      "@@ -1,1 +1,1 @@",
      "-x",
      "+y",
    ].join("\n");
    const chunks = splitUnifiedDiffIntoFileChunks(`${fileA}\n${fileB}`);
    expect(chunks).toEqual([fileA, fileB]);
  });

  it("splits on --- file headers when diff --git lines are absent (stripped preamble)", () => {
    const fileA = [
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,1 +1,1 @@",
      "-x",
      "+y",
    ].join("\n");
    const fileB = [
      "--- a/b.ts",
      "+++ b/b.ts",
      "@@ -1,1 +1,1 @@",
      "-p",
      "+q",
    ].join("\n");
    const chunks = splitUnifiedDiffIntoFileChunks(`${fileA}\n${fileB}`);
    expect(chunks).toEqual([fileA, fileB]);
  });

  it("does not split a file's +++ header line into its own chunk", () => {
    const diff = [
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,1 +1,1 @@",
      "-x",
      "+y",
    ].join("\n");
    expect(splitUnifiedDiffIntoFileChunks(diff)).toEqual([diff]);
  });

  it("handles three files, keeping each file's diff --git/index/header lines together", () => {
    const files = ["a.ts", "b.ts", "c.ts"].map((name) =>
      [
        `diff --git a/${name} b/${name}`,
        "index 111..222 100644",
        `--- a/${name}`,
        `+++ b/${name}`,
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new",
      ].join("\n"),
    );
    const chunks = splitUnifiedDiffIntoFileChunks(files.join("\n"));
    expect(chunks).toEqual(files);
  });

  it("handles a binary file diff with no hunks as its own chunk", () => {
    const fileA = [
      "diff --git a/img.png b/img.png",
      "index 111..222 100644",
      "Binary files a/img.png and b/img.png differ",
    ].join("\n");
    const fileB = [
      "diff --git a/a.ts b/a.ts",
      "index abc..def 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,1 +1,1 @@",
      "-x",
      "+y",
    ].join("\n");
    const chunks = splitUnifiedDiffIntoFileChunks(`${fileA}\n${fileB}`);
    expect(chunks).toEqual([fileA, fileB]);
  });
});

describe("groupDiffChunksByBudget", () => {
  it("returns an empty array for empty input", () => {
    expect(groupDiffChunksByBudget([], 100)).toEqual([]);
  });

  it("packs all chunks into one batch when they fit under the budget", () => {
    const chunks = ["aaa", "bbb", "ccc"];
    expect(groupDiffChunksByBudget(chunks, 100)).toEqual(["aaa\nbbb\nccc"]);
  });

  it("splits into multiple batches when combined length exceeds the budget", () => {
    const chunks = ["a".repeat(10), "b".repeat(10), "c".repeat(10)];
    const batches = groupDiffChunksByBudget(chunks, 15);
    expect(batches).toEqual(["a".repeat(10), "b".repeat(10), "c".repeat(10)]);
  });

  it("groups chunks that fit together into the same batch", () => {
    const chunks = ["a".repeat(5), "b".repeat(5), "c".repeat(5)];
    const batches = groupDiffChunksByBudget(chunks, 11);
    expect(batches).toEqual(["aaaaa\nbbbbb", "ccccc"]);
  });

  it("puts an oversized single chunk in its own batch rather than dropping it", () => {
    const chunks = ["small", "x".repeat(50)];
    const batches = groupDiffChunksByBudget(chunks, 10);
    expect(batches).toEqual(["small", "x".repeat(50)]);
  });

  it("accounts for the newline join cost between chunks", () => {
    // "aaaaa" (5) + "\n" (1) + "bbbbb" (5) = 11, exactly the budget
    const chunks = ["a".repeat(5), "b".repeat(5)];
    expect(groupDiffChunksByBudget(chunks, 11)).toEqual(["aaaaa\nbbbbb"]);
    // one char over budget forces a split
    expect(groupDiffChunksByBudget(chunks, 10)).toEqual(["aaaaa", "bbbbb"]);
  });
});
