import type { DiffChange, ObjectId } from "@scolladon/tsgit";

import type { RenderedFileDiff } from "../src/git/diffRender";
import {
  buildFileSummary,
  mergeFileSummariesByPath,
  summarizeFiles,
} from "../src/git/diffSummary";

const oid = (s: string): ObjectId => s as ObjectId;

function rendered(over: Partial<RenderedFileDiff> = {}): RenderedFileDiff {
  return {
    path: "f.ts",
    added: 0,
    deleted: 0,
    binary: false,
    text: "",
    ...over,
  };
}

describe("buildFileSummary", () => {
  it("summarizes an add change", () => {
    const change: DiffChange = {
      type: "add",
      newPath: "new.ts",
      newId: oid("a"),
      newMode: "100644",
    };
    const out = buildFileSummary(
      change,
      rendered({ path: "new.ts", added: 3 }),
    );
    expect(out).toMatchObject({
      path: "new.ts",
      status: "added",
      additions: 3,
      deletions: 0,
    });
    expect(out.oldPath).toBeUndefined();
    expect(out.newPath).toBeUndefined();
  });

  it("summarizes a delete change", () => {
    const change: DiffChange = {
      type: "delete",
      oldPath: "gone.ts",
      oldId: oid("a"),
      oldMode: "100644",
    };
    const out = buildFileSummary(
      change,
      rendered({ path: "gone.ts", deleted: 5 }),
    );
    expect(out).toMatchObject({
      path: "gone.ts",
      status: "deleted",
      deletions: 5,
    });
  });

  it("summarizes a rename change with oldPath/newPath set", () => {
    const change: DiffChange = {
      type: "rename",
      oldPath: "old.ts",
      newPath: "new.ts",
      oldId: oid("a"),
      newId: oid("b"),
      oldMode: "100644",
      newMode: "100644",
      similarity: { score: 100, maxScore: 100 },
    };
    const out = buildFileSummary(
      change,
      rendered({ path: "new.ts", oldPath: "old.ts", newPath: "new.ts" }),
    );
    expect(out).toMatchObject({
      path: "new.ts",
      status: "renamed",
      oldPath: "old.ts",
      newPath: "new.ts",
    });
  });

  it("does not set oldPath/newPath for a plain modify", () => {
    const change: DiffChange = {
      type: "modify",
      path: "f.ts",
      oldId: oid("a"),
      newId: oid("b"),
      oldMode: "100644",
      newMode: "100644",
    };
    const out = buildFileSummary(change, rendered({ added: 1, deleted: 1 }));
    expect(out.oldPath).toBeUndefined();
    expect(out.newPath).toBeUndefined();
    expect(out.status).toBe("modified");
  });

  it("sets binary true only when the rendered diff is binary", () => {
    const change: DiffChange = {
      type: "modify",
      path: "img.png",
      oldId: oid("a"),
      newId: oid("b"),
      oldMode: "100644",
      newMode: "100644",
    };
    expect(
      buildFileSummary(change, rendered({ path: "img.png", binary: true }))
        .binary,
    ).toBe(true);
    expect(
      buildFileSummary(change, rendered({ path: "img.png", binary: false }))
        .binary,
    ).toBeUndefined();
  });
});

describe("mergeFileSummariesByPath", () => {
  it("sums additions/deletions for duplicate paths", () => {
    const merged = mergeFileSummariesByPath([
      { path: "a.ts", status: "modified", additions: 1, deletions: 1 },
      { path: "a.ts", status: "modified", additions: 2, deletions: 0 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ additions: 3, deletions: 1 });
  });

  it("merges statuses toward higher precedence", () => {
    const merged = mergeFileSummariesByPath([
      { path: "a.ts", status: "modified", additions: 1, deletions: 1 },
      { path: "a.ts", status: "deleted", additions: 0, deletions: 1 },
    ]);
    expect(merged[0]?.status).toBe("deleted");
  });

  it("fills in oldPath from a later rename entry", () => {
    const merged = mergeFileSummariesByPath([
      { path: "shared.ts", status: "modified", additions: 1, deletions: 1 },
      {
        path: "shared.ts",
        status: "renamed",
        additions: 0,
        deletions: 0,
        oldPath: "old.ts",
        newPath: "shared.ts",
      },
    ]);
    expect(merged[0]).toMatchObject({
      oldPath: "old.ts",
      newPath: "shared.ts",
    });
  });

  it("propagates binary true once set", () => {
    const merged = mergeFileSummariesByPath([
      { path: "a.bin", status: "modified", additions: 0, deletions: 0 },
      {
        path: "a.bin",
        status: "modified",
        additions: 0,
        deletions: 0,
        binary: true,
      },
    ]);
    expect(merged[0]?.binary).toBe(true);
  });

  it("keeps distinct paths separate", () => {
    const merged = mergeFileSummariesByPath([
      { path: "a.ts", status: "modified", additions: 1, deletions: 0 },
      { path: "b.ts", status: "added", additions: 2, deletions: 0 },
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("summarizeFiles", () => {
  it("computes totals from the file list", () => {
    const summary = summarizeFiles([
      { path: "a.ts", status: "modified", additions: 2, deletions: 1 },
      { path: "b.ts", status: "added", additions: 5, deletions: 0 },
    ]);
    expect(summary).toEqual({
      files: expect.any(Array),
      totalFiles: 2,
      totalAdditions: 7,
      totalDeletions: 1,
    });
  });

  it("handles an empty file list", () => {
    expect(summarizeFiles([])).toEqual({
      files: [],
      totalFiles: 0,
      totalAdditions: 0,
      totalDeletions: 0,
    });
  });
});
