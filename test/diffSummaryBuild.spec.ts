import { buildDiffSummaryFromGitOutputs } from "../src/git/diffSummaryBuild";

describe("buildDiffSummaryFromGitOutputs", () => {
  it("produces status 'copied' for C100 name-status entries", () => {
    const summary = buildDiffSummaryFromGitOutputs(
      "C100\torig.ts\tcopy.ts",
      "1\t0\tcopy.ts",
    );
    expect(summary.files.find((f) => f.path === "copy.ts")?.status).toBe(
      "copied",
    );
  });

  it("produces status 'type-changed' for T name-status entries", () => {
    const summary = buildDiffSummaryFromGitOutputs(
      "T\tfile.ext",
      "0\t0\tfile.ext",
    );
    expect(summary.files.find((f) => f.path === "file.ext")?.status).toBe(
      "type-changed",
    );
  });

  it("includes oldPath in the synthetic line for renamed files", () => {
    const summary = buildDiffSummaryFromGitOutputs(
      "R100\told.ts\tnew.ts",
      "5\t3\tnew.ts",
    );
    expect(summary.files.find((f) => f.path === "new.ts")).toMatchObject({
      oldPath: "old.ts",
      status: "renamed",
    });
  });

  it("uses zero additions and deletions for files absent from numstat", () => {
    const summary = buildDiffSummaryFromGitOutputs("M\tfile.ts", "");
    const file = summary.files.find((f) => f.path === "file.ts");
    expect(file).toMatchObject({ additions: 0, deletions: 0 });
  });

  it("marks binary flag for files reported as binary in numstat", () => {
    const summary = buildDiffSummaryFromGitOutputs(
      "M\timage.png",
      "-\t-\timage.png",
    );
    expect(summary.files.find((f) => f.path === "image.png")?.binary).toBe(
      true,
    );
  });

  it("does not set binary flag for text files", () => {
    const summary = buildDiffSummaryFromGitOutputs(
      "M\tfile.ts",
      "5\t3\tfile.ts",
    );
    expect(
      summary.files.find((f) => f.path === "file.ts")?.binary,
    ).toBeUndefined();
  });

  it("reflects numstat additions and deletions in the final summary", () => {
    const summary = buildDiffSummaryFromGitOutputs(
      "M\tfile.ts",
      "10\t4\tfile.ts",
    );
    const file = summary.files.find((f) => f.path === "file.ts");
    expect(file?.additions).toBe(10);
    expect(file?.deletions).toBe(4);
  });
});
