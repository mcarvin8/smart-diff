import { CliUsageError, HELP_TEXT, parseCliArgs } from "../src/cliOptions";

describe("parseCliArgs", () => {
  it("returns kind 'help' for --help", () => {
    expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
  });

  it("returns kind 'help' for -h", () => {
    expect(parseCliArgs(["-h"])).toEqual({ kind: "help" });
  });

  it("returns kind 'version' for --version", () => {
    expect(parseCliArgs(["--version"])).toEqual({ kind: "version" });
  });

  it("returns kind 'version' for -v", () => {
    expect(parseCliArgs(["-v"])).toEqual({ kind: "version" });
  });

  it("prefers help over version when both are passed", () => {
    expect(parseCliArgs(["--help", "--version"])).toEqual({ kind: "help" });
  });

  it("throws CliUsageError when from is missing", () => {
    expect(() => parseCliArgs([])).toThrow(CliUsageError);
    expect(() => parseCliArgs([])).toThrow(/Missing required <from> ref/);
  });

  it("accepts from as a positional argument", () => {
    const parsed = parseCliArgs(["origin/main"]);
    expect(parsed.kind).toBe("run");
    if (parsed.kind === "run") {
      expect(parsed.options.from).toBe("origin/main");
      expect(parsed.options.to).toBeUndefined();
    }
  });

  it("accepts to as a second positional argument", () => {
    const parsed = parseCliArgs(["origin/main", "HEAD"]);
    if (parsed.kind !== "run") throw new Error("expected run");
    expect(parsed.options.from).toBe("origin/main");
    expect(parsed.options.to).toBe("HEAD");
  });

  it("prefers --from/--to flags over positionals", () => {
    const parsed = parseCliArgs([
      "positional-from",
      "positional-to",
      "--from",
      "flag-from",
      "--to",
      "flag-to",
    ]);
    if (parsed.kind !== "run") throw new Error("expected run");
    expect(parsed.options.from).toBe("flag-from");
    expect(parsed.options.to).toBe("flag-to");
  });

  it("defaults reportUsage to false when --usage is omitted", () => {
    const parsed = parseCliArgs(["origin/main"]);
    if (parsed.kind !== "run") throw new Error("expected run");
    expect(parsed.reportUsage).toBe(false);
  });

  it("sets reportUsage when --usage is passed", () => {
    const parsed = parseCliArgs(["origin/main", "--usage"]);
    if (parsed.kind !== "run") throw new Error("expected run");
    expect(parsed.reportUsage).toBe(true);
  });

  it("collects repeatable --include/--exclude flags into arrays", () => {
    const parsed = parseCliArgs([
      "origin/main",
      "--include",
      "src",
      "--include",
      "test",
      "--exclude",
      "dist",
    ]);
    if (parsed.kind !== "run") throw new Error("expected run");
    expect(parsed.options.includeFolders).toEqual(["src", "test"]);
    expect(parsed.options.excludeFolders).toEqual(["dist"]);
  });

  it("collects repeatable commit-include/commit-exclude regex flags", () => {
    const parsed = parseCliArgs([
      "origin/main",
      "--commit-include",
      "^feat",
      "--commit-exclude",
      "^chore",
    ]);
    if (parsed.kind !== "run") throw new Error("expected run");
    expect(parsed.options.commitMessageIncludeRegexes).toEqual(["^feat"]);
    expect(parsed.options.commitMessageExcludeRegexes).toEqual(["^chore"]);
  });

  it("maps string flags onto their option names", () => {
    const parsed = parseCliArgs([
      "origin/main",
      "--cwd",
      "/repo",
      "--team",
      "QA",
      "--system-prompt",
      "custom prompt",
      "--provider",
      "anthropic",
      "--model",
      "claude-3-5-sonnet-latest",
    ]);
    if (parsed.kind !== "run") throw new Error("expected run");
    expect(parsed.options.cwd).toBe("/repo");
    expect(parsed.options.teamName).toBe("QA");
    expect(parsed.options.systemPrompt).toBe("custom prompt");
    expect(parsed.options.provider).toBe("anthropic");
    expect(parsed.options.model).toBe("claude-3-5-sonnet-latest");
  });

  it("parses numeric flags", () => {
    const parsed = parseCliArgs([
      "origin/main",
      "--max-diff-chars",
      "1000",
      "--max-retries",
      "3",
      "--context-lines",
      "1",
      "--max-hunk-lines",
      "50",
    ]);
    if (parsed.kind !== "run") throw new Error("expected run");
    expect(parsed.options.maxDiffChars).toBe(1000);
    expect(parsed.options.maxRetries).toBe(3);
    expect(parsed.options.contextLines).toBe(1);
    expect(parsed.options.maxHunkLines).toBe(50);
  });

  it("throws CliUsageError for a non-numeric --max-diff-chars", () => {
    expect(() =>
      parseCliArgs(["origin/main", "--max-diff-chars", "nope"]),
    ).toThrow(CliUsageError);
    expect(() =>
      parseCliArgs(["origin/main", "--max-diff-chars", "nope"]),
    ).toThrow(/Invalid number for --max-diff-chars/);
  });

  it("throws CliUsageError for a non-numeric --max-retries", () => {
    expect(() =>
      parseCliArgs(["origin/main", "--max-retries", "nope"]),
    ).toThrow(/Invalid number for --max-retries/);
  });

  it("leaves numeric options undefined when their flags are omitted", () => {
    const parsed = parseCliArgs(["origin/main"]);
    if (parsed.kind !== "run") throw new Error("expected run");
    expect(parsed.options.maxDiffChars).toBeUndefined();
    expect(parsed.options.maxRetries).toBeUndefined();
    expect(parsed.options.contextLines).toBeUndefined();
    expect(parsed.options.maxHunkLines).toBeUndefined();
  });

  it("sets boolean flags when passed and leaves them undefined otherwise", () => {
    const on = parseCliArgs([
      "origin/main",
      "--map-reduce",
      "--ignore-whitespace",
      "--strip-diff-preamble",
      "--exclude-default-noise",
      "--redact-secrets",
    ]);
    if (on.kind !== "run") throw new Error("expected run");
    expect(on.options.mapReduce).toBe(true);
    expect(on.options.ignoreWhitespace).toBe(true);
    expect(on.options.stripDiffPreamble).toBe(true);
    expect(on.options.excludeDefaultNoise).toBe(true);
    expect(on.options.redactSecrets).toBe(true);

    const off = parseCliArgs(["origin/main"]);
    if (off.kind !== "run") throw new Error("expected run");
    expect(off.options.mapReduce).toBeUndefined();
    expect(off.options.ignoreWhitespace).toBeUndefined();
    expect(off.options.stripDiffPreamble).toBeUndefined();
    expect(off.options.excludeDefaultNoise).toBeUndefined();
    expect(off.options.redactSecrets).toBeUndefined();
  });
});

describe("HELP_TEXT", () => {
  it("documents the required <from> ref and the flag groups", () => {
    expect(HELP_TEXT).toContain("smart-diff <from> [to] [options]");
    expect(HELP_TEXT).toContain("--max-diff-chars");
    expect(HELP_TEXT).toContain("--redact-secrets");
    expect(HELP_TEXT).toContain("--usage");
  });
});
