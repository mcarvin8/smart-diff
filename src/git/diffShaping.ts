import {
  DEFAULT_SECRET_PATTERNS,
  redactSecrets,
  type SecretRedactionRule,
} from "./diffRedaction.js";

/**
 * Options that reshape a unified diff to reduce token cost before sending it to an LLM.
 * Every option is opt-in; none of them alter the logical meaning of the diff (`redactSecrets`
 * is the one exception — it deliberately masks credential-shaped values).
 */
export type DiffShapingOptions = {
  /**
   * Number of context lines around each change. Passed as `-U<n>` to `git diff`.
   * Git defaults to 3; lowering to 0 or 1 commonly saves 30–60% of tokens on
   * modification-heavy diffs with little loss of fidelity.
   */
  contextLines?: number;
  /**
   * Pass `-w` / `--ignore-all-space` to `git diff`. Pure-whitespace hunks vanish,
   * which is usually what you want when the model is reasoning about behavior.
   */
  ignoreWhitespace?: boolean;
  /**
   * Strip low-value preamble lines from the unified diff: `diff --git`, `index`,
   * `new/deleted file mode`, `old/new mode`, `similarity index`, `rename/copy from/to`.
   * `--- a/...`, `+++ b/...`, and `@@` lines are kept so the model still sees file
   * identity and hunk positions.
   */
  stripDiffPreamble?: boolean;
  /**
   * Replace any hunk body longer than this many lines with a single elision marker
   * after the truncation point, preserving the `@@` header. Totals are still
   * reflected by the structured `DiffSummary`.
   */
  maxHunkLines?: number;
  /**
   * Redact likely secrets/credentials (cloud keys, tokens, private key blocks,
   * JWTs, `Bearer` headers, basic-auth URL passwords, `KEY=value` assignments)
   * from the diff text before it's sent to the LLM. Uses {@link DEFAULT_SECRET_PATTERNS}
   * unless `secretPatterns` overrides them.
   */
  redactSecrets?: boolean;
  /**
   * Overrides the built-in secret-detection rules used when `redactSecrets` is
   * true. Defaults to {@link DEFAULT_SECRET_PATTERNS}.
   */
  secretPatterns?: readonly SecretRedactionRule[];
};

/**
 * Common high-token-cost files/folders that rarely help an LLM summarize a change.
 * Entries are repo-root relative paths suitable for `excludeFolders` / git
 * `:(exclude)` pathspecs. Opt in via `excludeDefaultNoise: true` on
 * `summarizeGitDiff`, or merge this list into your own `excludeFolders`.
 */
export const DEFAULT_NOISE_EXCLUDES: readonly string[] = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "npm-shrinkwrap.json",
  "bun.lockb",
  "go.sum",
  "Cargo.lock",
  "Gemfile.lock",
  "composer.lock",
  "Pipfile.lock",
  "poetry.lock",
  "uv.lock",
  "Podfile.lock",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "__snapshots__",
];

function normalizeContextLines(raw: number): number {
  // Stryker disable next-line EqualityOperator
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.trunc(raw);
}

/** Build the leading args for `git diff` implied by shaping options. */
export function buildDiffShapingGitArgs(
  shaping?: DiffShapingOptions,
): string[] {
  const args: string[] = [];
  if (shaping?.contextLines !== undefined) {
    args.push(`-U${normalizeContextLines(shaping.contextLines)}`);
  }
  if (shaping?.ignoreWhitespace) {
    args.push("-w");
  }
  return args;
}

const PREAMBLE_NOISE_PREFIXES = [
  "diff --git ",
  "index ",
  "new file mode ",
  "deleted file mode ",
  "old mode ",
  "new mode ",
  "similarity index ",
  "dissimilarity index ",
  "rename from ",
  "rename to ",
  "copy from ",
  "copy to ",
];

function isPreambleNoiseLine(line: string): boolean {
  for (const prefix of PREAMBLE_NOISE_PREFIXES) {
    if (line.startsWith(prefix)) return true;
  }
  return false;
}

function stripPreambleLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !isPreambleNoiseLine(line))
    .join("\n");
}

/**
 * True when a line is a real unified-diff file header (`--- a/...`, `+++ b/...`,
 * or `/dev/null`), not a deleted/added body line that happens to begin with `---`/`+++`.
 */
function isFileHeaderLine(line: string): boolean {
  return (
    /^--- (a\/|b\/|"a\/|"b\/|\/dev\/null)/.test(line) ||
    /^\+\+\+ (a\/|b\/|"a\/|"b\/|\/dev\/null)/.test(line)
  );
}

function elideLargeHunks(text: string, maxHunkLines: number): string {
  const limit = normalizeContextLines(maxHunkLines);
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let inHunk = false;
  let hunkBuf: string[] = [];

  const flushHunk = (): void => {
    if (hunkBuf.length > limit) {
      const elided = hunkBuf.length - limit;
      out.push(...hunkBuf.slice(0, limit));
      out.push(
        `[... ${elided} diff line${elided === 1 ? "" : "s"} elided ...]`,
      );
    } else {
      out.push(...hunkBuf);
    }
    hunkBuf = [];
    inHunk = false;
  };

  for (const line of lines) {
    if (line.startsWith("@@")) {
      // Stryker disable next-line ConditionalExpression
      if (inHunk) flushHunk();
      out.push(line);
      inHunk = true;
      continue;
    }
    if (line.startsWith("diff --git ") || isFileHeaderLine(line)) {
      // Stryker disable next-line ConditionalExpression
      if (inHunk) flushHunk();
      out.push(line);
      continue;
    }
    if (inHunk) {
      hunkBuf.push(line);
    } else {
      out.push(line);
    }
  }
  // Stryker disable next-line ConditionalExpression
  if (inHunk) flushHunk();
  return out.join("\n");
}

/**
 * Apply post-processing shaping (secret redaction, preamble stripping, and
 * hunk elision) to a unified diff. `-U<n>` / `-w` are handled separately via
 * {@link buildDiffShapingGitArgs} since they need to reach `git diff`.
 *
 * Order: redact secrets, then strip preamble, then elide hunks — redaction
 * runs first so nothing bypasses it via later truncation.
 */
export function shapeUnifiedDiff(
  text: string,
  shaping?: DiffShapingOptions,
): string {
  if (
    !shaping?.stripDiffPreamble &&
    shaping?.maxHunkLines === undefined &&
    !shaping?.redactSecrets
  ) {
    return text;
  }
  let out = text;
  if (shaping.redactSecrets) {
    out = redactSecrets(out, shaping.secretPatterns ?? DEFAULT_SECRET_PATTERNS);
  }
  if (shaping.stripDiffPreamble) {
    out = stripPreambleLines(out);
  }
  if (shaping.maxHunkLines !== undefined) {
    out = elideLargeHunks(out, shaping.maxHunkLines);
  }
  return out;
}
