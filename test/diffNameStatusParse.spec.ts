import {
  mergeNameEntriesByPath,
  parseNameStatusLines,
} from "../src/git/diffNameStatusParse";

describe("parseNameStatusLines", () => {
  it("returns empty array for blank input", () => {
    expect(parseNameStatusLines("")).toHaveLength(0);
  });

  it("parses a simple modified entry", () => {
    const entries = parseNameStatusLines("M\tfile.ts");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: "file.ts", status: "modified" });
  });

  it("ignores a single-token line with no tab", () => {
    const entries = parseNameStatusLines("M");
    expect(entries).toHaveLength(0);
  });

  it("ignores a rename with only one path column (incomplete line)", () => {
    const entries = parseNameStatusLines("R100\told.ts");
    expect(entries).toHaveLength(0);
  });

  it("parses a full rename with old and new paths", () => {
    const entries = parseNameStatusLines("R100\told.ts\tnew.ts");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      path: "new.ts",
      status: "renamed",
      oldPath: "old.ts",
    });
  });

  it("uses second column as path for non-rename entries regardless of column count", () => {
    const entries = parseNameStatusLines("M\tfile.ts\textra");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: "file.ts", status: "modified" });
  });

  it("trims leading/trailing whitespace from name-status lines", () => {
    const entries = parseNameStatusLines("  M\tfile.ts  ");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: "file.ts", status: "modified" });
  });

  it("skips empty lines", () => {
    const entries = parseNameStatusLines("\nM\tfile.ts\n\n");
    expect(entries).toHaveLength(1);
  });

  it("parses CRLF line endings", () => {
    const entries = parseNameStatusLines("M\ta.ts\r\nA\tb.ts");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.path).toBe("a.ts");
    expect(entries[1]?.path).toBe("b.ts");
  });
});

describe("mergeNameEntriesByPath", () => {
  it("preserves first oldPath when same path appears twice with different oldPaths", () => {
    const entries = parseNameStatusLines(
      ["R100\told/a.ts\tshared.ts", "R100\told/b.ts\tshared.ts"].join("\n"),
    );
    const byPath = mergeNameEntriesByPath(entries);
    expect(byPath.get("shared.ts")?.oldPath).toBe("old/a.ts");
  });

  it("fills in oldPath from a later entry when first had none", () => {
    const entries = parseNameStatusLines(
      ["M\tshared.ts", "R100\told/a.ts\tshared.ts"].join("\n"),
    );
    const byPath = mergeNameEntriesByPath(entries);
    expect(byPath.get("shared.ts")?.oldPath).toBe("old/a.ts");
  });

  it("does not overwrite existing oldPath when later entry has no oldPath", () => {
    const entries = parseNameStatusLines(
      ["R100\told/a.ts\tshared.ts", "M\tshared.ts"].join("\n"),
    );
    const byPath = mergeNameEntriesByPath(entries);
    expect(byPath.get("shared.ts")?.oldPath).toBe("old/a.ts");
  });

  it("merges status toward higher precedence when same path appears twice", () => {
    const entries = parseNameStatusLines(
      ["M\tfile.ts", "D\tfile.ts"].join("\n"),
    );
    const byPath = mergeNameEntriesByPath(entries);
    expect(byPath.get("file.ts")?.status).toBe("deleted");
  });
});
