import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeSummaryContextFiles } from "../src/contextFiles";

describe("writeSummaryContextFiles", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(mkdtempSync(join(tmpdir(), "smart-diff-ctx-")), "nested");
  });

  afterEach(() => {
    rmSync(join(dir, ".."), { recursive: true, force: true });
  });

  it("writes system.md and user.md for single mode", () => {
    const manifest = writeSummaryContextFiles(
      { mode: "single", notice: "N", systemPrompt: "SYS", userContent: "USER" },
      dir,
    );

    expect(manifest).toEqual({
      schemaVersion: 1,
      mode: "single",
      notice: "N",
      files: {
        systemPrompt: join(dir, "system.md"),
        userContent: join(dir, "user.md"),
      },
    });
    expect(readFileSync(join(dir, "system.md"), "utf8")).toBe("SYS");
    expect(readFileSync(join(dir, "user.md"), "utf8")).toBe("USER");
  });

  it("writes zero-padded batch files for map-reduce mode", () => {
    const batches = Array.from({ length: 10 }, (_, i) => `B${i + 1}`);
    const manifest = writeSummaryContextFiles(
      {
        mode: "map-reduce",
        notice: "N",
        mapSystemPrompt: "MAP",
        mapUserContents: batches,
        reduceSystemPrompt: "RED",
        reduceUserContentPrefix: "PREFIX",
      },
      dir,
    );

    if (manifest.mode !== "map-reduce") throw new Error("expected map-reduce");
    expect(manifest.files.mapUserContents[0]).toBe(join(dir, "batch-01.md"));
    expect(manifest.files.mapUserContents[9]).toBe(join(dir, "batch-10.md"));
    expect(readFileSync(join(dir, "batch-10.md"), "utf8")).toBe("B10");
    expect(readFileSync(manifest.files.mapSystemPrompt, "utf8")).toBe("MAP");
    expect(readFileSync(manifest.files.reduceSystemPrompt, "utf8")).toBe("RED");
    expect(readFileSync(manifest.files.reduceUserContentPrefix, "utf8")).toBe(
      "PREFIX",
    );
  });
});
