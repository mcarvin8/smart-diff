import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readPromptFiles } from "../src/promptFiles";

describe("readPromptFiles", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "smart-diff-prompt-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined for no paths", () => {
    expect(readPromptFiles(undefined)).toBeUndefined();
    expect(readPromptFiles([])).toBeUndefined();
  });

  it("joins trimmed file contents with blank lines, in order", () => {
    writeFileSync(join(dir, "a.md"), "\n Rule A. \n");
    writeFileSync(join(dir, "b.md"), "Rule B.");
    expect(readPromptFiles(["a.md", "b.md"], dir)).toBe("Rule A.\n\nRule B.");
  });

  it("resolves relative paths against process.cwd() by default", () => {
    const original = process.cwd();
    writeFileSync(join(dir, "rel.md"), "Rel.");
    process.chdir(dir);
    try {
      expect(readPromptFiles(["rel.md"])).toBe("Rel.");
    } finally {
      process.chdir(original);
    }
  });

  it("skips empty files and returns undefined when all are empty", () => {
    writeFileSync(join(dir, "empty.md"), "  \n");
    writeFileSync(join(dir, "b.md"), "Rule B.");
    expect(readPromptFiles(["empty.md", "b.md"], dir)).toBe("Rule B.");
    expect(readPromptFiles(["empty.md"], dir)).toBeUndefined();
  });

  it("accepts absolute paths", () => {
    const file = join(dir, "abs.md");
    writeFileSync(file, "Abs.");
    expect(readPromptFiles([file], join(dir, "elsewhere"))).toBe("Abs.");
  });

  it("throws with the given path when a file is missing", () => {
    expect(() => readPromptFiles(["missing.md"], dir)).toThrow(
      /Cannot read prompt file "missing.md"/,
    );
  });
});
