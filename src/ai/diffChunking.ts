/**
 * True for a unified diff's file-header start line (`--- a/...`, `--- b/...`,
 * `--- /dev/null`, or the quoted variants). Used only as a fallback boundary
 * marker when `diff --git` lines have been stripped from the text (see
 * `DiffShapingOptions.stripDiffPreamble`); `+++` isn't matched so a file's
 * `--- `/`+++ ` header pair isn't split into two chunks.
 */
function isFileHeaderStart(line: string): boolean {
  return /^--- (a\/|"a\/|\/dev\/null)/.test(line);
}

/**
 * Split a unified diff into one chunk per file. Prefers `diff --git ` lines
 * as the boundary marker — unambiguous, since hunk body lines always start
 * with `+`, `-`, or a space and can never literally begin with `diff --git `.
 * Falls back to `--- a/...` file-header lines when no `diff --git` lines are
 * present (e.g. after `stripDiffPreamble`).
 *
 * Returns an empty array for empty input, and a single chunk for a diff with
 * no detectable file boundaries (already-small or unrecognized input).
 */
export function splitUnifiedDiffIntoFileChunks(diffText: string): string[] {
  if (diffText.length === 0) return [];

  const lines = diffText.split(/\r?\n/);
  const hasDiffGitLines = lines.some((line) => line.startsWith("diff --git "));
  const isBoundary = hasDiffGitLines
    ? (line: string) => line.startsWith("diff --git ")
    : isFileHeaderStart;

  const chunks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (isBoundary(line) && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  chunks.push(current.join("\n"));
  return chunks;
}

/**
 * Greedily pack file chunks (in order) into batches whose combined length
 * stays within `maxCharsPerBatch`. A single chunk larger than the budget
 * becomes its own oversized batch rather than being split mid-file — the
 * caller is expected to apply a per-batch safety truncation on top of this.
 */
export function groupDiffChunksByBudget(
  chunks: string[],
  maxCharsPerBatch: number,
): string[] {
  const batches: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const chunk of chunks) {
    const addLen = chunk.length + (current.length > 0 ? 1 : 0);
    if (current.length > 0 && currentLen + addLen > maxCharsPerBatch) {
      batches.push(current.join("\n"));
      current = [chunk];
      currentLen = chunk.length;
    } else {
      current.push(chunk);
      currentLen += addLen;
    }
  }
  if (current.length > 0) batches.push(current.join("\n"));
  return batches;
}
