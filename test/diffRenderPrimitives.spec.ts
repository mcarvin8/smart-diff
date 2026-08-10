import {
  buildHunks,
  computeLineOps,
  countLineOps,
  formatHunks,
} from "../src/git/diffRenderPrimitives";

describe("computeLineOps", () => {
  it("produces a single context run for identical text", () => {
    const ops = computeLineOps("a\nb\n", "a\nb\n");
    expect(ops.every((o) => o.kind === "context")).toBe(true);
    expect(ops.map((o) => o.text)).toEqual(["a", "b"]);
  });

  it("marks the last line noEol when the new text lacks a trailing newline", () => {
    const ops = computeLineOps("a\n", "a");
    const last = ops.at(-1)!;
    expect(last.text).toBe("a");
    expect(last.noEol).toBe(true);
  });

  it("treats an empty string as zero lines", () => {
    expect(computeLineOps("", "")).toEqual([]);
  });

  it("produces del-only ops for a pure deletion to empty", () => {
    const ops = computeLineOps("a\nb\n", "");
    expect(ops).toEqual([
      { kind: "del", text: "a", noEol: false },
      { kind: "del", text: "b", noEol: false },
    ]);
  });

  it("produces add-only ops for a pure addition from empty", () => {
    const ops = computeLineOps("", "a\nb\n");
    expect(ops).toEqual([
      { kind: "add", text: "a", noEol: false },
      { kind: "add", text: "b", noEol: false },
    ]);
  });
});

describe("countLineOps", () => {
  it("counts add and del ops, ignoring context", () => {
    const ops = computeLineOps("a\nb\nc\n", "a\nx\nc\n");
    expect(countLineOps(ops)).toEqual({ added: 1, deleted: 1 });
  });

  it("returns zero counts for identical text", () => {
    expect(countLineOps(computeLineOps("same\n", "same\n"))).toEqual({
      added: 0,
      deleted: 0,
    });
  });
});

describe("buildHunks", () => {
  it("returns no hunks when nothing changed", () => {
    expect(buildHunks(computeLineOps("a\nb\n", "a\nb\n"), 3)).toEqual([]);
  });

  it("builds one hunk with correct start/length for a single-line change", () => {
    const ops = computeLineOps("a\nb\nc\n", "a\nB\nc\n");
    const hunks = buildHunks(ops, 3);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 3,
    });
  });

  it("uses oldStart 0 for a pure addition at the very start with zero context", () => {
    const ops = computeLineOps("", "new\n");
    const hunks = buildHunks(ops, 0);
    expect(hunks[0]).toMatchObject({
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 1,
    });
  });

  it("uses newStart 0 for a pure deletion with zero context", () => {
    const ops = computeLineOps("gone\n", "");
    const hunks = buildHunks(ops, 0);
    expect(hunks[0]).toMatchObject({
      oldStart: 1,
      oldLines: 1,
      newStart: 0,
      newLines: 0,
    });
  });

  it("derives oldStart from the preceding context line for a mid-file pure addition", () => {
    const ops = computeLineOps("line1\n", "line1\nline2\n");
    const hunks = buildHunks(ops, 0);
    expect(hunks[0]).toMatchObject({ oldStart: 1, oldLines: 0, newStart: 2 });
  });

  it("derives newStart from the preceding context line for a mid-file pure deletion", () => {
    const ops = computeLineOps("line1\nline2\n", "line1\n");
    const hunks = buildHunks(ops, 0);
    expect(hunks[0]).toMatchObject({ newStart: 1, newLines: 0, oldStart: 2 });
  });

  it("splits distant changes into separate hunks", () => {
    const oldText = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const newLines = Array.from({ length: 20 }, (_, i) => `l${i}`);
    newLines[0] = "CHANGED-0";
    newLines[19] = "CHANGED-19";
    const ops = computeLineOps(`${oldText}\n`, `${newLines.join("\n")}\n`);
    const hunks = buildHunks(ops, 1);
    expect(hunks).toHaveLength(2);
  });

  it("merges two changes within 2*context of each other into one hunk", () => {
    const oldLines = Array.from({ length: 10 }, (_, i) => `l${i}`);
    const newLines = [...oldLines];
    newLines[2] = "CHANGED-2";
    newLines[6] = "CHANGED-6";
    const ops = computeLineOps(
      `${oldLines.join("\n")}\n`,
      `${newLines.join("\n")}\n`,
    );
    // gap between changed lines (index 2 and 6) is 3; context 2 => merge window 4 >= gap-1(3)
    const hunks = buildHunks(ops, 2);
    expect(hunks).toHaveLength(1);
  });
});

describe("formatHunks", () => {
  it("renders a @@ header and prefixed lines", () => {
    const ops = computeLineOps("a\nb\nc\n", "a\nB\nc\n");
    const text = formatHunks(buildHunks(ops, 3));
    expect(text.split("\n")).toEqual([
      "@@ -1,3 +1,3 @@",
      " a",
      "-b",
      "+B",
      " c",
    ]);
  });

  it("appends the no-newline marker after a noEol line", () => {
    const ops = computeLineOps("a\n", "a\nb");
    const text = formatHunks(buildHunks(ops, 3));
    expect(text).toContain("+b");
    expect(text.split("\n").at(-1)).toBe("\\ No newline at end of file");
  });

  it("returns empty string for no hunks", () => {
    expect(formatHunks([])).toBe("");
  });
});
