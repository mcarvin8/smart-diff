import { accumulateNumStat } from "../src/git/diffNumstatParse";

function accumulate(
  input: string,
): Map<string, { additions: number; deletions: number }> {
  const m = new Map<string, { additions: number; deletions: number }>();
  accumulateNumStat(input, m);
  return m;
}

describe("accumulateNumStat", () => {
  it("parses a basic line", () => {
    const m = accumulate("5\t3\tsrc/foo.ts");
    expect(m.get("src/foo.ts")).toEqual({ additions: 5, deletions: 3 });
  });

  it("accumulates multiple lines for the same key", () => {
    const m = accumulate("2\t1\tsrc/foo.ts\n3\t4\tsrc/foo.ts");
    expect(m.get("src/foo.ts")).toEqual({ additions: 5, deletions: 5 });
  });

  it("skips empty lines", () => {
    const m = accumulate("\n5\t3\tsrc/foo.ts\n\n");
    expect(m.size).toBe(1);
  });

  it("skips lines with fewer than 3 tab-separated fields", () => {
    const m = accumulate("5\t3");
    expect(m.size).toBe(0);
  });

  it("handles lines with leading/trailing whitespace", () => {
    const m = accumulate("  5\t3\tsrc/foo.ts  ");
    expect(m.get("src/foo.ts")).toBeDefined();
    expect(m.get("src/foo.ts")).toMatchObject({ additions: 5, deletions: 3 });
  });

  it("parses rename path without dir prefix: key is the new name", () => {
    const m = accumulate("5\t3\t{old.ts => new.ts}");
    expect(m.get("new.ts")).toEqual({ additions: 5, deletions: 3 });
    expect(m.has("{old.ts => new.ts}")).toBe(false);
  });

  it("parses rename path with dir prefix: key preserves prefix + new name", () => {
    const m = accumulate("5\t3\tsrc/prefix/{old.ts => new.ts}");
    expect(m.get("src/prefix/new.ts")).toEqual({ additions: 5, deletions: 3 });
    expect(m.has("src/prefix/{old.ts => new.ts}")).toBe(false);
  });

  it("trims whitespace from new segment in rename path", () => {
    const m = accumulate("5\t3\tsrc/{old.ts =>  new.ts }");
    expect(m.get("src/new.ts")).toEqual({ additions: 5, deletions: 3 });
  });

  it("uses entire old-part for matching (not just first char)", () => {
    const m = accumulate("1\t2\t{longoldname.ts => newname.ts}");
    expect(m.get("newname.ts")).toEqual({ additions: 1, deletions: 2 });
  });

  it("uses entire new-part for key (not just first char)", () => {
    const m = accumulate("1\t2\t{old.ts => longnewname.ts}");
    expect(m.get("longnewname.ts")).toEqual({ additions: 1, deletions: 2 });
  });

  it("handles non-rename paths with brace-like chars as literal key", () => {
    const m = accumulate("1\t1\tsrc/no-rename.ts");
    expect(m.get("src/no-rename.ts")).toEqual({ additions: 1, deletions: 1 });
  });

  it("parses CRLF line endings", () => {
    const m = accumulate("5\t3\tsrc/a.ts\r\n2\t1\tsrc/b.ts");
    expect(m.get("src/a.ts")).toEqual({ additions: 5, deletions: 3 });
    expect(m.get("src/b.ts")).toEqual({ additions: 2, deletions: 1 });
  });
});
