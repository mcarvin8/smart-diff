import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Repository } from "@scolladon/tsgit";
import { openRepository } from "@scolladon/tsgit";

type FixtureFileMap = Record<string, string | Uint8Array>;

export type FixtureRepo = {
  repo: Repository;
  dir: string;
  /** Write/modify/delete files, stage everything, and commit. Returns the new commit id. */
  commit(
    message: string,
    files?: FixtureFileMap,
    deletePaths?: string[],
  ): Promise<string>;
  cleanup(): Promise<void>;
};

function writeFiles(dir: string, files: FixtureFileMap): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

/** Real temp-directory git repo backed by tsgit's Node adapter — one integer clock tick per commit for determinism. */
export async function createFixtureRepo(): Promise<FixtureRepo> {
  // realpath'd (native — resolves Windows 8.3 short names too, not just symlinks)
  // because getRepoRoot() returns the canonical path: macOS aliases /var to
  // /private/var, and CI Windows runners' TEMP can be an 8.3 short-name path.
  const dir = realpathSync.native(
    mkdtempSync(join(tmpdir(), "smart-diff-fixture-")),
  );
  const repo = await openRepository({ cwd: dir });
  await repo.init();
  let timestamp = 1_700_000_000;

  return {
    repo,
    dir,
    async commit(message, files = {}, deletePaths = []) {
      writeFiles(dir, files);
      for (const p of deletePaths) {
        rmSync(join(dir, p), { force: true });
      }
      await repo.add([], { all: true });
      const result = await repo.commit({
        message,
        author: {
          name: "Test",
          email: "test@example.com",
          timestamp: timestamp++,
          timezoneOffset: "+0000",
        },
      });
      return result.id;
    },
    async cleanup() {
      await repo.dispose();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
