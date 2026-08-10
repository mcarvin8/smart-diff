import { join } from "node:path";

import {
  buildPathFilterPredicate,
  matchesAnyPath,
} from "../src/git/diffPathFilter";

describe("buildPathFilterPredicate", () => {
  const repoRoot = join(__dirname, "fixture-repo-root");

  it("matches everything when no filter is given", () => {
    const predicate = buildPathFilterPredicate(repoRoot);
    expect(predicate("anything/at/all.ts")).toBe(true);
  });

  it("excludes an exact excluded path and anything under it", () => {
    const predicate = buildPathFilterPredicate(repoRoot, {
      excludeFolders: ["node_modules", "dist"],
    });
    expect(predicate("node_modules")).toBe(false);
    expect(predicate("node_modules/pkg/index.js")).toBe(false);
    expect(predicate("dist/bundle.js")).toBe(false);
    expect(predicate("src/index.ts")).toBe(true);
  });

  it("restricts to include folders and their subpaths only", () => {
    const predicate = buildPathFilterPredicate(repoRoot, {
      includeFolders: ["src", "packages/lib"],
    });
    expect(predicate("src/index.ts")).toBe(true);
    expect(predicate("src")).toBe(true);
    expect(predicate("packages/lib/a.ts")).toBe(true);
    expect(predicate("packages/other/a.ts")).toBe(false);
    expect(predicate("README.md")).toBe(false);
  });

  it("does not match a sibling path that merely shares a prefix", () => {
    const predicate = buildPathFilterPredicate(repoRoot, {
      includeFolders: ["src"],
    });
    expect(predicate("src-other/file.ts")).toBe(false);
  });

  it("applies excludes on top of includes", () => {
    const predicate = buildPathFilterPredicate(repoRoot, {
      includeFolders: ["src"],
      excludeFolders: ["src/generated"],
    });
    expect(predicate("src/index.ts")).toBe(true);
    expect(predicate("src/generated/a.ts")).toBe(false);
  });

  it("normalizes backslashes and slashes in configured folders", () => {
    const predicate = buildPathFilterPredicate(repoRoot, {
      includeFolders: ["src\\app"],
    });
    expect(predicate("src/app/main.ts")).toBe(true);
  });

  it("treats a root-like include as the whole repo", () => {
    const predicate = buildPathFilterPredicate(repoRoot, {
      includeFolders: ["/"],
      excludeFolders: ["tmp"],
    });
    expect(predicate("anything.ts")).toBe(true);
    expect(predicate("tmp/x")).toBe(false);
  });

  it("ignores blank/whitespace-only entries", () => {
    const predicate = buildPathFilterPredicate(repoRoot, {
      includeFolders: ["", "  ", "src"],
    });
    expect(predicate("src/index.ts")).toBe(true);
    expect(predicate("other.ts")).toBe(false);
  });

  it("throws when an include path escapes the repository root", () => {
    expect(() =>
      buildPathFilterPredicate(repoRoot, { includeFolders: ["../outside"] }),
    ).toThrow(/escapes repository root/);
  });

  it("throws when an exclude path escapes the repository root", () => {
    expect(() =>
      buildPathFilterPredicate(repoRoot, {
        excludeFolders: ["../somewhere-else"],
      }),
    ).toThrow(/escapes repository root/);
  });

  it("throws when include path resolves exactly to the parent directory", () => {
    expect(() =>
      buildPathFilterPredicate(repoRoot, { includeFolders: [".."] }),
    ).toThrow(/escapes repository root/);
  });
});

describe("matchesAnyPath", () => {
  it("is true when at least one defined path matches", () => {
    const predicate = (p: string): boolean => p === "b";
    expect(matchesAnyPath(predicate, ["a", "b"])).toBe(true);
  });

  it("is false when no defined path matches", () => {
    const predicate = (p: string): boolean => p === "z";
    expect(matchesAnyPath(predicate, ["a", "b"])).toBe(false);
  });

  it("skips undefined candidates", () => {
    const predicate = (p: string): boolean => p === "b";
    expect(matchesAnyPath(predicate, [undefined, "b"])).toBe(true);
  });
});
