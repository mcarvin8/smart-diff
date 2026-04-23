import {
  DEFAULT_NOISE_EXCLUDES,
  buildDiffShapingGitArgs,
  shapeUnifiedDiff,
} from "../src/git/gitDiff";

describe("buildDiffShapingGitArgs", () => {
  it("returns an empty array when shaping is undefined", () => {
    expect(buildDiffShapingGitArgs()).toEqual([]);
  });

  it("returns an empty array when no fields are set", () => {
    expect(buildDiffShapingGitArgs({})).toEqual([]);
  });

  it("emits -U<n> for valid contextLines", () => {
    expect(buildDiffShapingGitArgs({ contextLines: 1 })).toEqual(["-U1"]);
  });

  it("truncates fractional contextLines", () => {
    expect(buildDiffShapingGitArgs({ contextLines: 2.9 })).toEqual(["-U2"]);
  });

  it("clamps negative contextLines to 0", () => {
    expect(buildDiffShapingGitArgs({ contextLines: -5 })).toEqual(["-U0"]);
  });

  it("clamps non-finite contextLines to 0", () => {
    expect(buildDiffShapingGitArgs({ contextLines: Number.NaN })).toEqual([
      "-U0",
    ]);
  });

  it("emits -w when ignoreWhitespace is true", () => {
    expect(buildDiffShapingGitArgs({ ignoreWhitespace: true })).toEqual(["-w"]);
  });

  it("omits -w when ignoreWhitespace is false", () => {
    expect(buildDiffShapingGitArgs({ ignoreWhitespace: false })).toEqual([]);
  });

  it("combines contextLines and ignoreWhitespace", () => {
    expect(
      buildDiffShapingGitArgs({ contextLines: 0, ignoreWhitespace: true }),
    ).toEqual(["-U0", "-w"]);
  });
});

describe("DEFAULT_NOISE_EXCLUDES", () => {
  it("includes common lockfiles and build outputs", () => {
    expect(DEFAULT_NOISE_EXCLUDES).toEqual(
      expect.arrayContaining([
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "node_modules",
        "dist",
        "coverage",
      ]),
    );
  });
});

const SAMPLE_DIFF = [
  "diff --git a/app.ts b/app.ts",
  "index abc123..def456 100644",
  "--- a/app.ts",
  "+++ b/app.ts",
  "@@ -1,4 +1,5 @@",
  " function add(a: number, b: number): number {",
  "-  return a + b;",
  "+  const result = a + b;",
  "+  return result;",
  " }",
  "diff --git a/lib.ts b/lib.ts",
  "similarity index 80%",
  "rename from src/old.ts",
  "rename to src/new.ts",
  "index 111..222 100644",
  "--- a/src/old.ts",
  "+++ b/src/new.ts",
  "@@ -10,2 +10,2 @@",
  "-const x = 1;",
  "+const x = 2;",
].join("\n");

describe("shapeUnifiedDiff", () => {
  it("returns input untouched when shaping is undefined", () => {
    expect(shapeUnifiedDiff(SAMPLE_DIFF)).toBe(SAMPLE_DIFF);
  });

  it("returns input untouched when shaping has no post-processing options", () => {
    expect(
      shapeUnifiedDiff(SAMPLE_DIFF, {
        contextLines: 1,
        ignoreWhitespace: true,
      }),
    ).toBe(SAMPLE_DIFF);
  });

  it("strips preamble noise while keeping ---/+++/@@ lines", () => {
    const out = shapeUnifiedDiff(SAMPLE_DIFF, { stripDiffPreamble: true });
    expect(out).not.toMatch(/^diff --git /m);
    expect(out).not.toMatch(/^index /m);
    expect(out).not.toMatch(/^similarity index /m);
    expect(out).not.toMatch(/^rename from /m);
    expect(out).not.toMatch(/^rename to /m);
    expect(out).toContain("--- a/app.ts");
    expect(out).toContain("+++ b/app.ts");
    expect(out).toContain("@@ -1,4 +1,5 @@");
    expect(out).toContain("-  return a + b;");
  });

  it("strips new/deleted file mode and old/new mode lines", () => {
    const raw = [
      "diff --git a/new.ts b/new.ts",
      "new file mode 100644",
      "index 0000000..abcdef",
      "--- /dev/null",
      "+++ b/new.ts",
      "@@ -0,0 +1,1 @@",
      "+added",
      "diff --git a/gone.ts b/gone.ts",
      "deleted file mode 100644",
      "index abcdef..0000000",
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1,1 +0,0 @@",
      "-removed",
      "diff --git a/exec.sh b/exec.sh",
      "old mode 100644",
      "new mode 100755",
    ].join("\n");
    const out = shapeUnifiedDiff(raw, { stripDiffPreamble: true });
    expect(out).not.toMatch(/^new file mode /m);
    expect(out).not.toMatch(/^deleted file mode /m);
    expect(out).not.toMatch(/^old mode /m);
    expect(out).not.toMatch(/^new mode /m);
    expect(out).toContain("--- /dev/null");
    expect(out).toContain("+++ /dev/null");
  });

  it("elides hunk bodies longer than maxHunkLines", () => {
    const bigHunk = [
      "--- a/big.ts",
      "+++ b/big.ts",
      "@@ -1,5 +1,5 @@",
      " line1",
      "-line2",
      "+line2b",
      " line3",
      " line4",
      " line5",
    ].join("\n");
    const out = shapeUnifiedDiff(bigHunk, { maxHunkLines: 3 });
    const lines = out.split("\n");
    expect(lines).toContain("@@ -1,5 +1,5 @@");
    expect(lines).toContain(" line1");
    expect(lines).toContain("-line2");
    expect(lines).toContain("+line2b");
    expect(lines.some((l) => /3 diff lines elided/.test(l))).toBe(true);
    expect(lines).not.toContain(" line5");
  });

  it("does not elide hunks at or below maxHunkLines", () => {
    const smallHunk = [
      "--- a/small.ts",
      "+++ b/small.ts",
      "@@ -1,2 +1,2 @@",
      "-old",
      "+new",
    ].join("\n");
    const out = shapeUnifiedDiff(smallHunk, { maxHunkLines: 10 });
    expect(out).toBe(smallHunk);
  });

  it("uses singular 'line' when exactly one line is elided", () => {
    const hunk = [
      "@@ -1,3 +1,3 @@",
      " a",
      "-b",
      "+c",
      " d",
    ].join("\n");
    const out = shapeUnifiedDiff(hunk, { maxHunkLines: 3 });
    expect(out).toMatch(/1 diff line elided/);
    expect(out).not.toMatch(/1 diff lines elided/);
  });

  it("flushes an open hunk when a new @@ header begins", () => {
    const raw = [
      "@@ -1,3 +1,3 @@",
      " a",
      "-b",
      "+c",
      " d",
      "@@ -20,2 +20,2 @@",
      "-x",
      "+y",
    ].join("\n");
    const out = shapeUnifiedDiff(raw, { maxHunkLines: 2 });
    const lines = out.split("\n");
    expect(lines.filter((l) => /diff line.* elided/.test(l)).length).toBe(1);
    expect(lines).toContain("@@ -20,2 +20,2 @@");
    expect(lines).toContain("-x");
  });

  it("flushes an open hunk when a new diff --git boundary appears", () => {
    const raw = [
      "@@ -1,3 +1,3 @@",
      " a",
      "-b",
      "+c",
      " d",
      "diff --git a/other.ts b/other.ts",
      "--- a/other.ts",
      "+++ b/other.ts",
      "@@ -1,1 +1,1 @@",
      "-x",
      "+y",
    ].join("\n");
    const out = shapeUnifiedDiff(raw, { maxHunkLines: 2 });
    const lines = out.split("\n");
    expect(lines).toContain("diff --git a/other.ts b/other.ts");
    expect(lines.filter((l) => /diff line.* elided/.test(l)).length).toBe(1);
  });

  it("composes preamble strip with hunk elision", () => {
    const out = shapeUnifiedDiff(SAMPLE_DIFF, {
      stripDiffPreamble: true,
      maxHunkLines: 1,
    });
    expect(out).not.toMatch(/^diff --git /m);
    expect(out).toMatch(/diff line.* elided/);
  });

  it("keeps hunk body lines that look like '---' deletions, not file headers", () => {
    const raw = [
      "--- a/foo.md",
      "+++ b/foo.md",
      "@@ -1,3 +1,3 @@",
      "-separator",
      "+replacement",
      "---",
    ].join("\n");
    const out = shapeUnifiedDiff(raw, { maxHunkLines: 100 });
    expect(out).toContain("---");
    expect(out).toContain("-separator");
  });

  it("treats maxHunkLines of 0 as eliding the entire body", () => {
    const hunk = [
      "@@ -1,2 +1,2 @@",
      "-a",
      "+b",
    ].join("\n");
    const out = shapeUnifiedDiff(hunk, { maxHunkLines: 0 });
    expect(out).toMatch(/^@@ -1,2 \+1,2 @@/);
    expect(out).toContain("2 diff lines elided");
    expect(out).not.toContain("\n-a");
  });

  it("normalizes negative and non-finite maxHunkLines to 0", () => {
    const hunk = ["@@ -1,1 +1,1 @@", "-a", "+b"].join("\n");
    expect(shapeUnifiedDiff(hunk, { maxHunkLines: -3 })).toContain(
      "diff lines elided",
    );
    expect(shapeUnifiedDiff(hunk, { maxHunkLines: Number.NaN })).toContain(
      "diff lines elided",
    );
  });

  it("does not collapse lines outside of any hunk when only maxHunkLines is set", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "index abc..def 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
    ].join("\n");
    expect(shapeUnifiedDiff(raw, { maxHunkLines: 1 })).toBe(raw);
  });
});
