import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Read prompt files and join their trimmed contents with blank lines, for use
 * as `systemPromptAppend`. Relative paths resolve against `baseDir` (default
 * `process.cwd()`). Empty files are skipped. Returns `undefined` when no paths
 * are given or every file is empty. Throws with the offending path when a file
 * can't be read.
 */
export function readPromptFiles(
  paths: readonly string[] | undefined,
  baseDir: string = process.cwd(),
): string | undefined {
  if (!paths || paths.length === 0) return undefined;
  const parts: string[] = [];
  for (const p of paths) {
    const full = resolve(baseDir, p);
    let text: string;
    try {
      text = readFileSync(full, "utf8");
    } catch (err) {
      const reason = (err as Error).message;
      throw new Error(
        `Cannot read prompt file ${JSON.stringify(p)}: ${reason}`,
      );
    }
    const trimmed = text.trim();
    if (trimmed) parts.push(trimmed);
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
