import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SummaryContext } from "./ai/index.js";

/** Manifest printed by `--emit-context --out-dir`: file paths instead of inline prompts. */
export type SummaryContextManifest =
  | {
      schemaVersion: 1;
      mode: "single";
      notice: string;
      files: { systemPrompt: string; userContent: string };
    }
  | {
      schemaVersion: 1;
      mode: "map-reduce";
      notice: string;
      files: {
        mapSystemPrompt: string;
        mapUserContents: string[];
        reduceSystemPrompt: string;
        reduceUserContentPrefix: string;
      };
    };

function write(dir: string, name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content, "utf8");
  return path;
}

/**
 * Write each prompt in `context` to its own plain-text file under `dir` (created
 * if missing) so an agent can read them without parsing huge JSON strings.
 * Returns a manifest of the written paths.
 */
export function writeSummaryContextFiles(
  context: SummaryContext,
  dir: string,
): SummaryContextManifest {
  mkdirSync(dir, { recursive: true });

  if (context.mode === "single") {
    return {
      schemaVersion: 1,
      mode: "single",
      notice: context.notice,
      files: {
        systemPrompt: write(dir, "system.md", context.systemPrompt),
        userContent: write(dir, "user.md", context.userContent),
      },
    };
  }

  const width = String(context.mapUserContents.length).length;
  return {
    schemaVersion: 1,
    mode: "map-reduce",
    notice: context.notice,
    files: {
      mapSystemPrompt: write(dir, "map-system.md", context.mapSystemPrompt),
      mapUserContents: context.mapUserContents.map((content, i) =>
        write(dir, `batch-${String(i + 1).padStart(width, "0")}.md`, content),
      ),
      reduceSystemPrompt: write(
        dir,
        "reduce-system.md",
        context.reduceSystemPrompt,
      ),
      reduceUserContentPrefix: write(
        dir,
        "reduce-user-prefix.md",
        context.reduceUserContentPrefix,
      ),
    },
  };
}
