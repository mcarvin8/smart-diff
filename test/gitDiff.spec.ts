import {
  type CommitInfo,
  filterCommitsByMessageRegexes,
} from "../src/git/index";

describe("filterCommitsByMessageRegexes", () => {
  const commits: CommitInfo[] = [
    { hash: "a1", message: "feat: add login" },
    { hash: "b2", message: "chore: bump deps" },
    { hash: "c3", message: "fix: handle edge case" },
  ];

  it("returns all commits when no patterns", () => {
    expect(filterCommitsByMessageRegexes(commits)).toEqual(commits);
    expect(filterCommitsByMessageRegexes(commits, [], [])).toEqual(commits);
  });

  it("applies exclude before include", () => {
    const out = filterCommitsByMessageRegexes(
      commits,
      ["feat:", "fix:"],
      ["chore:"],
    );
    expect(out.map((c) => c.hash)).toEqual(["a1", "c3"]);
  });

  it("requires OR match across include patterns", () => {
    const out = filterCommitsByMessageRegexes(commits, ["^feat:", "^fix:"]);
    expect(out).toHaveLength(2);
    expect(out[0]?.hash).toBe("a1");
    expect(out[1]?.hash).toBe("c3");
  });

  it("drops commits matching exclude only", () => {
    const out = filterCommitsByMessageRegexes(commits, undefined, ["chore:"]);
    expect(out.map((c) => c.hash)).toEqual(["a1", "c3"]);
  });

  it("is case-insensitive for regex", () => {
    const out = filterCommitsByMessageRegexes(
      [{ hash: "x", message: "FEAT: caps" }],
      ["feat:"],
    );
    expect(out).toHaveLength(1);
  });

  it("throws on invalid include pattern", () => {
    expect(() => filterCommitsByMessageRegexes(commits, ["("], [])).toThrow(
      /include pattern\[0\]/,
    );
  });

  it("throws on invalid exclude pattern", () => {
    expect(() => filterCommitsByMessageRegexes(commits, [], ["("])).toThrow(
      /exclude pattern\[0\]/,
    );
  });

  it("ignores empty string include patterns", () => {
    const out = filterCommitsByMessageRegexes(commits, ["", "feat:"]);
    expect(out.map((c) => c.hash)).toEqual(["a1"]);
  });

  it("ignores empty string exclude patterns", () => {
    const out = filterCommitsByMessageRegexes(commits, undefined, [
      "",
      "chore:",
    ]);
    expect(out.map((c) => c.hash)).toEqual(["a1", "c3"]);
  });

  it("ignores whitespace-only include patterns", () => {
    const out = filterCommitsByMessageRegexes(commits, ["  ", "chore:"]);
    expect(out.map((c) => c.hash)).toEqual(["b2"]);
  });

  it("ignores whitespace-only exclude patterns", () => {
    const out = filterCommitsByMessageRegexes(commits, undefined, [
      "  ",
      "chore:",
    ]);
    expect(out.map((c) => c.hash)).toEqual(["a1", "c3"]);
  });

  it("trims whitespace from include patterns before matching", () => {
    const out = filterCommitsByMessageRegexes(commits, ["  feat:  "]);
    expect(out.map((c) => c.hash)).toEqual(["a1"]);
  });

  it("trims whitespace from exclude patterns before matching", () => {
    const out = filterCommitsByMessageRegexes(commits, undefined, [
      "  chore:  ",
    ]);
    expect(out.map((c) => c.hash)).toEqual(["a1", "c3"]);
  });
});
