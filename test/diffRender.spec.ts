import type { DiffChange, ObjectId, Repository } from "@scolladon/tsgit";

import { renderFileDiff } from "../src/git/diffRender";

const oid = (s: string): ObjectId => s as ObjectId;
const encoder = new TextEncoder();

/** Minimal stub satisfying only what renderFileDiff touches — no real repo needed. */
function stubRepo(blobs: Record<string, string>): Repository {
  return {
    primitives: {
      readBlob: async (id: ObjectId) => ({
        type: "blob" as const,
        id,
        content: encoder.encode(blobs[id as unknown as string] ?? ""),
      }),
    },
  } as unknown as Repository;
}

describe("renderFileDiff — mode changes", () => {
  it("emits old mode/new mode lines for a pure mode change with unchanged content", async () => {
    const change: DiffChange = {
      type: "modify",
      path: "script.sh",
      oldId: oid("a"),
      newId: oid("a"),
      oldMode: "100644",
      newMode: "100755",
    };
    const repo = stubRepo({ a: "echo hi\n" });

    const out = await renderFileDiff(repo, change, 3);

    expect(out.text).toContain("old mode 100644");
    expect(out.text).toContain("new mode 100755");
    expect(out.added).toBe(0);
    expect(out.deleted).toBe(0);
  });

  it("emits old mode/new mode lines for a rename with a mode change", async () => {
    const change: DiffChange = {
      type: "rename",
      oldPath: "old.sh",
      newPath: "new.sh",
      oldId: oid("a"),
      newId: oid("a"),
      oldMode: "100644",
      newMode: "100755",
      similarity: { score: 100, maxScore: 100 },
    };
    const repo = stubRepo({ a: "echo hi\n" });

    const out = await renderFileDiff(repo, change, 3);

    expect(out.text).toContain("old mode 100644");
    expect(out.text).toContain("new mode 100755");
    expect(out.text).toContain("rename from old.sh");
  });

  it("emits copy from/to lines for a copy change", async () => {
    const change: DiffChange = {
      type: "copy",
      oldPath: "src.ts",
      newPath: "dup.ts",
      oldId: oid("a"),
      newId: oid("a"),
      oldMode: "100644",
      newMode: "100644",
      similarity: { score: 100, maxScore: 100 },
    };
    const repo = stubRepo({ a: "shared\n" });

    const out = await renderFileDiff(repo, change, 3);

    expect(out.text).toContain("copy from src.ts");
    expect(out.text).toContain("copy to dup.ts");
    expect(out.text).toContain("similarity index 100%");
  });

  it("reports similarity 0% instead of dividing by a zero maxScore", async () => {
    const change: DiffChange = {
      type: "rename",
      oldPath: "old.ts",
      newPath: "new.ts",
      oldId: oid("a"),
      newId: oid("b"),
      oldMode: "100644",
      newMode: "100644",
      similarity: { score: 0, maxScore: 0 },
    };
    const repo = stubRepo({ a: "x\n", b: "y\n" });

    const out = await renderFileDiff(repo, change, 3);

    expect(out.text).toContain("similarity index 0%");
  });

  it("omits old mode/new mode lines when the mode is unchanged", async () => {
    const change: DiffChange = {
      type: "modify",
      path: "f.ts",
      oldId: oid("a"),
      newId: oid("b"),
      oldMode: "100644",
      newMode: "100644",
    };
    const repo = stubRepo({ a: "one\n", b: "two\n" });

    const out = await renderFileDiff(repo, change, 3);

    expect(out.text).not.toContain("old mode");
    expect(out.text).not.toContain("new mode");
  });
});
