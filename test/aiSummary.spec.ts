import {
  DEFAULT_GIT_DIFF_SYSTEM_PROMPT,
  DEFAULT_MAP_REDUCE_MAP_SYSTEM_PROMPT,
  DEFAULT_MAP_REDUCE_REDUCE_SYSTEM_PROMPT,
  LLM_GATEWAY_REQUIRED_MESSAGE,
} from "../src/ai/aiConstants";
import {
  generateSummary,
  resolveLlmMaxDiffChars,
  resolveLlmMaxRetries,
  truncateUnifiedDiffForLlm,
} from "../src/ai/aiSummary";
import * as llmProviders from "../src/ai/llmProviders";
import type { CommitInfo } from "../src/git/gitDiff";
import {
  extractSystemText,
  extractUserText,
  makeMockModel as mockModel,
  makeFlakyMockProvider as provideFlakyMock,
  makeMockProvider as provideMock,
  makeSequentialMockProvider as provideSequentialMock,
} from "./helpers/mockLlm";

describe("resolveLlmMaxDiffChars", () => {
  const originalLlm = process.env.LLM_MAX_DIFF_CHARS;
  const originalOpenAi = process.env.OPENAI_MAX_DIFF_CHARS;

  afterEach(() => {
    if (originalLlm === undefined) delete process.env.LLM_MAX_DIFF_CHARS;
    else process.env.LLM_MAX_DIFF_CHARS = originalLlm;
    if (originalOpenAi === undefined) delete process.env.OPENAI_MAX_DIFF_CHARS;
    else process.env.OPENAI_MAX_DIFF_CHARS = originalOpenAi;
  });

  it("uses positive cli override", () => {
    expect(resolveLlmMaxDiffChars(50_000)).toBe(50_000);
  });

  it("truncates float cli override", () => {
    expect(resolveLlmMaxDiffChars(99.7)).toBe(99);
  });

  it("ignores non-positive cli override and reads env", () => {
    process.env.LLM_MAX_DIFF_CHARS = "8000";
    expect(resolveLlmMaxDiffChars(0)).toBe(8000);
    expect(resolveLlmMaxDiffChars(-1)).toBe(8000);
  });

  it("falls back to legacy OPENAI_MAX_DIFF_CHARS env", () => {
    process.env.OPENAI_MAX_DIFF_CHARS = "7000";
    expect(resolveLlmMaxDiffChars()).toBe(7000);
  });

  it("prefers LLM_MAX_DIFF_CHARS over OPENAI_MAX_DIFF_CHARS", () => {
    process.env.LLM_MAX_DIFF_CHARS = "8000";
    process.env.OPENAI_MAX_DIFF_CHARS = "7000";
    expect(resolveLlmMaxDiffChars()).toBe(8000);
  });

  it("falls back to default when env invalid", () => {
    process.env.LLM_MAX_DIFF_CHARS = "not-a-number";
    expect(resolveLlmMaxDiffChars()).toBe(120_000);
  });

  it("ignores NaN cli override", () => {
    process.env.LLM_MAX_DIFF_CHARS = "500";
    expect(resolveLlmMaxDiffChars(Number.NaN)).toBe(500);
  });

  it("ignores Infinity cli override and reads env", () => {
    process.env.LLM_MAX_DIFF_CHARS = "500";
    expect(resolveLlmMaxDiffChars(Infinity)).toBe(500);
  });

  it("ignores zero from env and uses default", () => {
    process.env.LLM_MAX_DIFF_CHARS = "0";
    expect(resolveLlmMaxDiffChars()).toBe(120_000);
  });

  it("ignores negative from env and uses default", () => {
    process.env.LLM_MAX_DIFF_CHARS = "-5";
    expect(resolveLlmMaxDiffChars()).toBe(120_000);
  });

  it("trims whitespace-only LLM_MAX_DIFF_CHARS and falls through to OPENAI_MAX_DIFF_CHARS", () => {
    process.env.LLM_MAX_DIFF_CHARS = "   ";
    process.env.OPENAI_MAX_DIFF_CHARS = "5000";
    expect(resolveLlmMaxDiffChars()).toBe(5000);
  });
});

describe("resolveLlmMaxRetries", () => {
  const originalEnv = process.env.LLM_MAX_RETRIES;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.LLM_MAX_RETRIES;
    else process.env.LLM_MAX_RETRIES = originalEnv;
  });

  it("defaults to 2 when unset", () => {
    delete process.env.LLM_MAX_RETRIES;
    expect(resolveLlmMaxRetries()).toBe(2);
  });

  it("uses a positive cli override", () => {
    expect(resolveLlmMaxRetries(5)).toBe(5);
  });

  it("honors a cli override of 0 (disables retries)", () => {
    expect(resolveLlmMaxRetries(0)).toBe(0);
  });

  it("truncates a float cli override", () => {
    expect(resolveLlmMaxRetries(3.9)).toBe(3);
  });

  it("ignores a negative cli override and reads env", () => {
    process.env.LLM_MAX_RETRIES = "4";
    expect(resolveLlmMaxRetries(-1)).toBe(4);
  });

  it("ignores a non-finite cli override and reads env", () => {
    process.env.LLM_MAX_RETRIES = "4";
    expect(resolveLlmMaxRetries(Number.NaN)).toBe(4);
    expect(resolveLlmMaxRetries(Number.POSITIVE_INFINITY)).toBe(4);
  });

  it("honors LLM_MAX_RETRIES from env when no cli override is given", () => {
    process.env.LLM_MAX_RETRIES = "7";
    expect(resolveLlmMaxRetries()).toBe(7);
  });

  it("allows env value of 0 (disables retries)", () => {
    process.env.LLM_MAX_RETRIES = "0";
    expect(resolveLlmMaxRetries()).toBe(0);
  });

  it("falls back to default when env is invalid", () => {
    process.env.LLM_MAX_RETRIES = "not-a-number";
    expect(resolveLlmMaxRetries()).toBe(2);
  });

  it("falls back to default when env is negative", () => {
    process.env.LLM_MAX_RETRIES = "-2";
    expect(resolveLlmMaxRetries()).toBe(2);
  });

  it("trims whitespace-only env and falls back to default", () => {
    process.env.LLM_MAX_RETRIES = "   ";
    expect(resolveLlmMaxRetries()).toBe(2);
  });
});

describe("truncateUnifiedDiffForLlm", () => {
  it("returns input unchanged when under limit", () => {
    expect(truncateUnifiedDiffForLlm("abc", 10)).toBe("abc");
  });

  it("returns input unchanged when exactly at limit", () => {
    const s = "x".repeat(10);
    expect(truncateUnifiedDiffForLlm(s, 10)).toBe(s);
  });

  it("truncates and appends marker when over limit", () => {
    const long = "x".repeat(100);
    const out = truncateUnifiedDiffForLlm(long, 20);
    expect(out.startsWith("x".repeat(20))).toBe(true);
    expect(out).toContain("TRUNCATED");
    expect(out.length).toBeGreaterThan(20);
  });

  it("slices at maxChars boundary in truncated output", () => {
    const long = "a".repeat(5) + "b".repeat(5);
    const out = truncateUnifiedDiffForLlm(long, 5);
    expect(out.startsWith("aaaaa")).toBe(true);
    expect(out).not.toContain("b");
  });
});

describe("DEFAULT_GIT_DIFF_SYSTEM_PROMPT", () => {
  it("is a non-empty markdown-oriented prompt", () => {
    expect(DEFAULT_GIT_DIFF_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    expect(DEFAULT_GIT_DIFF_SYSTEM_PROMPT).toContain("git");
  });
});

describe("LLM_GATEWAY_REQUIRED_MESSAGE", () => {
  it("is a stable exported string for callers", () => {
    expect(LLM_GATEWAY_REQUIRED_MESSAGE).toContain("LLM_PROVIDER");
    expect(LLM_GATEWAY_REQUIRED_MESSAGE).toContain("llmModelProvider");
  });
});

describe("generateSummary", () => {
  const commits: CommitInfo[] = [
    { hash: "deadbeef", message: "feat: example" },
  ];
  const flagsBase = { from: "main", to: "HEAD" };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when no provider is configured and no injection", async () => {
    vi.spyOn(llmProviders, "isLlmProviderConfigured").mockReturnValue(false);

    await expect(
      generateSummary({
        diffText: "+added line",
        fileNames: ["src/a.ts"],
        commits,
        flags: flagsBase,
      }),
    ).rejects.toThrow(LLM_GATEWAY_REQUIRED_MESSAGE);
  });

  it("uses llmModelProvider when passed", async () => {
    vi.spyOn(llmProviders, "isLlmProviderConfigured").mockReturnValue(false);

    const { llmModelProvider, calls } = provideMock(
      "  **Summary** from inject  ",
    );

    const md = await generateSummary({
      diffText: "diff...",
      fileNames: ["f.ts"],
      commits,
      flags: {
        ...flagsBase,
        team: "QA",
        systemPrompt: "You are a test bot.",
        model: "ignored-when-provider-injected",
        maxDiffChars: 1000,
      },
      llmModelProvider,
    });

    expect(md).toBe("**Summary** from inject");
    const call = calls()[0]!;
    expect(extractSystemText(call)).toBe("You are a test bot.");
    expect(extractUserText(call)).toContain("Team: QA");
  });

  it("resolves from env when no injection is passed", async () => {
    vi.spyOn(llmProviders, "isLlmProviderConfigured").mockReturnValue(true);
    const { model, calls } = mockModel("  **Summary** from env  ");
    vi.spyOn(llmProviders, "resolveLanguageModel").mockResolvedValue(model);

    const md = await generateSummary({
      diffText: "diff...",
      fileNames: ["f.ts"],
      commits,
      flags: {
        ...flagsBase,
        team: "QA",
        systemPrompt: "Test prompt.",
        model: "gpt-test",
        provider: "openai",
        maxDiffChars: 1000,
      },
    });

    expect(md).toBe("**Summary** from env");
    expect(llmProviders.resolveLanguageModel).toHaveBeenCalledWith({
      provider: "openai",
      model: "gpt-test",
    });
    const call = calls()[0]!;
    expect(extractSystemText(call)).toBe("Test prompt.");
    expect(extractUserText(call)).toContain("Team: QA");
  });

  it("prepends markdown truncation notice when diff exceeds maxDiffChars", async () => {
    const { llmModelProvider } = provideMock("Body only.");

    const md = await generateSummary({
      diffText: "x".repeat(50),
      fileNames: ["f.ts"],
      commits,
      flags: { ...flagsBase, maxDiffChars: 20 },
      llmModelProvider,
    });

    expect(md.startsWith("> **Truncated diff:**")).toBe(true);
    expect(md).toContain("50 characters");
    expect(md).toContain("20 were sent");
    expect(md).toContain("context window");
    expect(md).toContain("Body only.");
  });

  it("passes model/provider options through to resolveLanguageModel with defaults", async () => {
    vi.spyOn(llmProviders, "isLlmProviderConfigured").mockReturnValue(true);
    const { model } = mockModel("ok");
    const spy = vi
      .spyOn(llmProviders, "resolveLanguageModel")
      .mockResolvedValue(model);

    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: flagsBase,
    });

    expect(spy).toHaveBeenCalledWith({});
  });

  it("includes exclude-only commit filter copy in user message", async () => {
    const { llmModelProvider, calls } = provideMock("x");

    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: {
        ...flagsBase,
        commitMessageExcludeRegexes: ["^WIP"],
      },
      llmModelProvider,
    });
    const userMsg = extractUserText(calls()[0]!);
    expect(userMsg).toContain("Commit message exclude regexes");
    expect(userMsg).not.toContain("include regexes");
  });

  it("omits team line when team is blank", async () => {
    const { llmModelProvider, calls } = provideMock("x");

    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: { ...flagsBase, team: "   " },
      llmModelProvider,
    });
    const userMsg = extractUserText(calls()[0]!);
    expect(userMsg).not.toMatch(/^Team:/m);
  });

  it("embeds diffSummary JSON when provided", async () => {
    const { llmModelProvider, calls } = provideMock("x");

    const diffSummary = {
      files: [],
      totalFiles: 0,
      totalAdditions: 0,
      totalDeletions: 0,
    };
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: flagsBase,
      diffSummary,
      llmModelProvider,
    });
    const userMsg = extractUserText(calls()[0]!);
    expect(userMsg).toContain("Structured git context");
    expect(userMsg).toContain('"totalFiles": 0');
  });

  it("returns placeholder when model returns empty content", async () => {
    const { llmModelProvider } = provideMock("   ");

    const md = await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: flagsBase,
      llmModelProvider,
    });
    expect(md).toBe("No summary generated by the model.");
  });

  it("includes 'Filters: none' copy when no commit regexes are set", async () => {
    const { llmModelProvider, calls } = provideMock("x");

    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: flagsBase,
      llmModelProvider,
    });
    const userMsg = extractUserText(calls()[0]!);
    expect(userMsg).toContain("Commit message filters: none");
    expect(userMsg).toContain("single unified diff");
  });

  it("shows '(no commits)' block when commits array is empty", async () => {
    const { llmModelProvider, calls } = provideMock("x");

    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: flagsBase,
      llmModelProvider,
    });
    const userMsg = extractUserText(calls()[0]!);
    expect(userMsg).toContain("(no commits in range after filtering)");
    expect(userMsg).toContain("(no paths in diff scope)");
  });

  it("falls back to provider default when LLM_MAX_TOKENS is invalid", async () => {
    const prev = process.env.OPENAI_MAX_TOKENS;
    process.env.OPENAI_MAX_TOKENS = "not-int";
    try {
      const { llmModelProvider, calls } = provideMock("ok");
      await generateSummary({
        diffText: "d",
        fileNames: [],
        commits: [],
        flags: flagsBase,
        llmModelProvider,
      });
      expect(calls()[0]!.maxOutputTokens).toBe(4000);
    } finally {
      if (prev === undefined) delete process.env.OPENAI_MAX_TOKENS;
      else process.env.OPENAI_MAX_TOKENS = prev;
    }
  });

  it("defaults 'to' ref to HEAD when flags.to is omitted", async () => {
    const { llmModelProvider, calls } = provideMock("ok");
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: { from: "main" },
      llmModelProvider,
    });
    expect(extractUserText(calls()[0]!)).toContain("Git refs: main..HEAD");
  });

  it("honors LLM_MAX_TOKENS when valid", async () => {
    const prev = process.env.LLM_MAX_TOKENS;
    process.env.LLM_MAX_TOKENS = "1234";
    try {
      const { llmModelProvider, calls } = provideMock("ok");
      await generateSummary({
        diffText: "d",
        fileNames: [],
        commits: [],
        flags: flagsBase,
        llmModelProvider,
      });
      expect(calls()[0]!.maxOutputTokens).toBe(1234);
    } finally {
      if (prev === undefined) delete process.env.LLM_MAX_TOKENS;
      else process.env.LLM_MAX_TOKENS = prev;
    }
  });

  it("defaults temperature to 0.2 when LLM_TEMPERATURE is unset", async () => {
    const prev = process.env.LLM_TEMPERATURE;
    delete process.env.LLM_TEMPERATURE;
    try {
      const { llmModelProvider, calls } = provideMock("ok");
      await generateSummary({
        diffText: "d",
        fileNames: [],
        commits: [],
        flags: flagsBase,
        llmModelProvider,
      });
      expect(calls()[0]!.temperature).toBe(0.2);
    } finally {
      if (prev === undefined) delete process.env.LLM_TEMPERATURE;
      else process.env.LLM_TEMPERATURE = prev;
    }
  });

  it("honors LLM_TEMPERATURE when valid", async () => {
    const prev = process.env.LLM_TEMPERATURE;
    process.env.LLM_TEMPERATURE = "0.7";
    try {
      const { llmModelProvider, calls } = provideMock("ok");
      await generateSummary({
        diffText: "d",
        fileNames: [],
        commits: [],
        flags: flagsBase,
        llmModelProvider,
      });
      expect(calls()[0]!.temperature).toBe(0.7);
    } finally {
      if (prev === undefined) delete process.env.LLM_TEMPERATURE;
      else process.env.LLM_TEMPERATURE = prev;
    }
  });

  it("clamps LLM_TEMPERATURE above 2 to 2", async () => {
    const prev = process.env.LLM_TEMPERATURE;
    process.env.LLM_TEMPERATURE = "5";
    try {
      const { llmModelProvider, calls } = provideMock("ok");
      await generateSummary({
        diffText: "d",
        fileNames: [],
        commits: [],
        flags: flagsBase,
        llmModelProvider,
      });
      expect(calls()[0]!.temperature).toBe(2);
    } finally {
      if (prev === undefined) delete process.env.LLM_TEMPERATURE;
      else process.env.LLM_TEMPERATURE = prev;
    }
  });

  it("clamps LLM_TEMPERATURE below 0 to 0", async () => {
    const prev = process.env.LLM_TEMPERATURE;
    process.env.LLM_TEMPERATURE = "-1";
    try {
      const { llmModelProvider, calls } = provideMock("ok");
      await generateSummary({
        diffText: "d",
        fileNames: [],
        commits: [],
        flags: flagsBase,
        llmModelProvider,
      });
      expect(calls()[0]!.temperature).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.LLM_TEMPERATURE;
      else process.env.LLM_TEMPERATURE = prev;
    }
  });

  it("falls back to 0.2 when LLM_TEMPERATURE is invalid", async () => {
    const prev = process.env.LLM_TEMPERATURE;
    process.env.LLM_TEMPERATURE = "not-a-number";
    try {
      const { llmModelProvider, calls } = provideMock("ok");
      await generateSummary({
        diffText: "d",
        fileNames: [],
        commits: [],
        flags: flagsBase,
        llmModelProvider,
      });
      expect(calls()[0]!.temperature).toBe(0.2);
    } finally {
      if (prev === undefined) delete process.env.LLM_TEMPERATURE;
      else process.env.LLM_TEMPERATURE = prev;
    }
  });

  it("uses 4000 when LLM_MAX_TOKENS is zero", async () => {
    const prev = process.env.LLM_MAX_TOKENS;
    process.env.LLM_MAX_TOKENS = "0";
    try {
      const { llmModelProvider, calls } = provideMock("ok");
      await generateSummary({
        diffText: "d",
        fileNames: [],
        commits: [],
        flags: flagsBase,
        llmModelProvider,
      });
      expect(calls()[0]!.maxOutputTokens).toBe(4000);
    } finally {
      if (prev === undefined) delete process.env.LLM_MAX_TOKENS;
      else process.env.LLM_MAX_TOKENS = prev;
    }
  });

  it("uses 4000 when LLM_MAX_TOKENS is negative", async () => {
    const prev = process.env.LLM_MAX_TOKENS;
    process.env.LLM_MAX_TOKENS = "-3";
    try {
      const { llmModelProvider, calls } = provideMock("ok");
      await generateSummary({
        diffText: "d",
        fileNames: [],
        commits: [],
        flags: flagsBase,
        llmModelProvider,
      });
      expect(calls()[0]!.maxOutputTokens).toBe(4000);
    } finally {
      if (prev === undefined) delete process.env.LLM_MAX_TOKENS;
      else process.env.LLM_MAX_TOKENS = prev;
    }
  });

  it("does not prepend truncation notice when diff length equals maxDiffChars", async () => {
    const { llmModelProvider } = provideMock("clean");
    const md = await generateSummary({
      diffText: "x".repeat(20),
      fileNames: [],
      commits: [],
      flags: { ...flagsBase, maxDiffChars: 20 },
      llmModelProvider,
    });
    expect(md).toBe("clean");
    expect(md).not.toContain("Truncated diff");
  });

  it("user message starts with Date line when no team is set", async () => {
    const { llmModelProvider, calls } = provideMock("x");
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: flagsBase,
      llmModelProvider,
    });
    expect(extractUserText(calls()[0]!)).toMatch(/^Date: /);
  });

  it("formats commit lines with 7-char hash, normalized CRLF, joined by newline", async () => {
    const { llmModelProvider, calls } = provideMock("x");
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [
        { hash: "abcdef1234567", message: "feat: multi\r\nline" },
        { hash: "zzz0001", message: "fix: other" },
      ],
      flags: flagsBase,
      llmModelProvider,
    });
    const userMsg = extractUserText(calls()[0]!);
    expect(userMsg).toContain("- abcdef1 feat: multi line");
    expect(userMsg).toContain("- zzz0001 fix: other");
    expect(userMsg).toContain(
      "- abcdef1 feat: multi line\n- zzz0001 fix: other",
    );
  });

  it("lists fileNames joined with newline when non-empty", async () => {
    const { llmModelProvider, calls } = provideMock("x");
    await generateSummary({
      diffText: "d",
      fileNames: ["src/a.ts", "src/b.ts"],
      commits: [],
      flags: flagsBase,
      llmModelProvider,
    });
    expect(extractUserText(calls()[0]!)).toContain("src/a.ts\nsrc/b.ts");
  });

  it("message contains section headers with correct surrounding structure", async () => {
    const { llmModelProvider, calls } = provideMock("x");
    await generateSummary({
      diffText: "the-diff",
      fileNames: ["a.ts"],
      commits: [],
      flags: flagsBase,
      llmModelProvider,
    });
    const userMsg = extractUserText(calls()[0]!);
    expect(userMsg).toContain("Date: ");
    expect(userMsg).toMatch(/\n\n=== Included commits \(subject lines\) ===/);
    expect(userMsg).toContain("=== Changed paths ===");
    expect(userMsg).toMatch(/\n\n=== Git context/);
    expect(userMsg).toContain("the-diff");
  });

  it("omits structured diff section and preserves git context header when diffSummary absent", async () => {
    const { llmModelProvider, calls } = provideMock("x");
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: flagsBase,
      llmModelProvider,
    });
    const userMsg = extractUserText(calls()[0]!);
    expect(userMsg).not.toContain("=== Structured git context");
    expect(userMsg).toMatch(/\n\n=== Git context/);
  });

  it("omits include filter line when all include regexes are whitespace-only", async () => {
    const { llmModelProvider, calls } = provideMock("x");
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: { ...flagsBase, commitMessageIncludeRegexes: ["   ", "  "] },
      llmModelProvider,
    });
    expect(extractUserText(calls()[0]!)).not.toContain("include regexes");
  });

  it("omits exclude filter line when all exclude regexes are whitespace-only", async () => {
    const { llmModelProvider, calls } = provideMock("x");
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: { ...flagsBase, commitMessageExcludeRegexes: ["   "] },
      llmModelProvider,
    });
    expect(extractUserText(calls()[0]!)).not.toContain("exclude regexes");
  });

  it("trims whitespace from include regex and shows JSON-stringified value", async () => {
    const { llmModelProvider, calls } = provideMock("x");
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: { ...flagsBase, commitMessageIncludeRegexes: ["  ^feat  "] },
      llmModelProvider,
    });
    const userMsg = extractUserText(calls()[0]!);
    expect(userMsg).toContain('"^feat"');
    expect(userMsg).not.toContain('"  ^feat  "');
  });

  it("trims whitespace from exclude regex and shows JSON-stringified value", async () => {
    const { llmModelProvider, calls } = provideMock("x");
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: { ...flagsBase, commitMessageExcludeRegexes: ["  ^WIP  "] },
      llmModelProvider,
    });
    const userMsg = extractUserText(calls()[0]!);
    expect(userMsg).toContain('"^WIP"');
    expect(userMsg).not.toContain('"  ^WIP  "');
  });

  it("joins multiple include regexes with comma-space separator", async () => {
    const { llmModelProvider, calls } = provideMock("x");
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: { ...flagsBase, commitMessageIncludeRegexes: ["^feat", "^fix"] },
      llmModelProvider,
    });
    expect(extractUserText(calls()[0]!)).toContain('"^feat", "^fix"');
  });

  it("joins multiple exclude regexes with comma-space separator", async () => {
    const { llmModelProvider, calls } = provideMock("x");
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: {
        ...flagsBase,
        commitMessageExcludeRegexes: ["^WIP", "^chore"],
      },
      llmModelProvider,
    });
    expect(extractUserText(calls()[0]!)).toContain('"^WIP", "^chore"');
  });

  it("shows per-commit shape context line when include regexes are set", async () => {
    const { llmModelProvider, calls } = provideMock("x");
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: { ...flagsBase, commitMessageIncludeRegexes: ["^feat"] },
      llmModelProvider,
    });
    expect(extractUserText(calls()[0]!)).toContain(
      "Git context shape: concatenated per-commit",
    );
  });
});

describe("generateSummary map-reduce", () => {
  const commits: CommitInfo[] = [
    { hash: "deadbeef", message: "feat: example" },
  ];
  const flagsBase = { from: "main", to: "HEAD" };

  const fileDiff = (name: string, content: string) =>
    [
      `diff --git a/${name} b/${name}`,
      "index abc..def 100644",
      `--- a/${name}`,
      `+++ b/${name}`,
      "@@ -1,1 +1,1 @@",
      `-old ${content}`,
      `+new ${content}`,
    ].join("\n");

  const threeFileDiff = [
    fileDiff("a.ts", "AAAAAAAAAA"),
    fileDiff("b.ts", "BBBBBBBBBB"),
    fileDiff("c.ts", "CCCCCCCCCC"),
  ].join("\n");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not use map-reduce when mapReduce is unset, even if the diff is oversized", async () => {
    const { llmModelProvider, calls } = provideMock("single-shot summary");

    const md = await generateSummary({
      diffText: threeFileDiff,
      fileNames: ["a.ts", "b.ts", "c.ts"],
      commits,
      flags: { ...flagsBase, maxDiffChars: 10 },
      llmModelProvider,
    });

    expect(calls()).toHaveLength(1);
    expect(md.startsWith("> **Truncated diff:**")).toBe(true);
    expect(md).not.toContain("Map-reduce summary");
  });

  it("does not use map-reduce when the diff already fits within maxDiffChars", async () => {
    const { llmModelProvider, calls } = provideMock("single-shot summary");

    const md = await generateSummary({
      diffText: threeFileDiff,
      fileNames: ["a.ts", "b.ts", "c.ts"],
      commits,
      flags: { ...flagsBase, maxDiffChars: 1_000_000, mapReduce: true },
      llmModelProvider,
    });

    expect(calls()).toHaveLength(1);
    expect(md).toBe("single-shot summary");
  });

  it("splits an oversized diff into per-file batches, maps, then reduces", async () => {
    const { llmModelProvider, calls } = provideSequentialMock([
      "batch1 summary",
      "batch2 summary",
      "batch3 summary",
      "FINAL SUMMARY",
    ]);

    const md = await generateSummary({
      diffText: threeFileDiff,
      fileNames: ["a.ts", "b.ts", "c.ts"],
      commits,
      flags: { ...flagsBase, maxDiffChars: 10, mapReduce: true },
      llmModelProvider,
    });

    expect(calls()).toHaveLength(4);
    expect(md.startsWith("> **Map-reduce summary:**")).toBe(true);
    expect(md).toContain("3 batches");
    expect(md).toContain("FINAL SUMMARY");

    const [mapCall1, mapCall2, mapCall3, reduceCall] = calls();

    expect(extractSystemText(mapCall1!)).toBe(
      DEFAULT_MAP_REDUCE_MAP_SYSTEM_PROMPT,
    );
    expect(extractUserText(mapCall1!)).toContain("Diff batch 1 of 3");
    expect(extractUserText(mapCall2!)).toContain("Diff batch 2 of 3");
    expect(extractUserText(mapCall3!)).toContain("Diff batch 3 of 3");

    expect(extractSystemText(reduceCall!)).toBe(
      DEFAULT_MAP_REDUCE_REDUCE_SYSTEM_PROMPT,
    );
    const reduceUserText = extractUserText(reduceCall!);
    expect(reduceUserText).toContain(
      "Per-batch summaries (synthesize into one cohesive report",
    );
    expect(reduceUserText).toContain("batch1 summary");
    expect(reduceUserText).toContain("batch2 summary");
    expect(reduceUserText).toContain("batch3 summary");
    expect(reduceUserText).toContain("--- Batch 1 of 3 ---");
    expect(reduceUserText).toContain("--- Batch 3 of 3 ---");
  });

  it("uses singular 'batch' wording when only one batch is produced", async () => {
    const { llmModelProvider } = provideSequentialMock(["only batch", "FINAL"]);

    const md = await generateSummary({
      diffText: fileDiff("solo.ts", "SOLO"),
      fileNames: ["solo.ts"],
      commits,
      flags: { ...flagsBase, maxDiffChars: 10, mapReduce: true },
      llmModelProvider,
    });

    expect(md).toContain("1 batch,");
    expect(md).not.toContain("1 batches");
  });

  it("uses a custom systemPrompt for the reduce phase but not the map phase", async () => {
    const { llmModelProvider, calls } = provideSequentialMock([
      "b1",
      "b2",
      "b3",
      "FINAL",
    ]);

    await generateSummary({
      diffText: threeFileDiff,
      fileNames: ["a.ts", "b.ts", "c.ts"],
      commits,
      flags: {
        ...flagsBase,
        maxDiffChars: 10,
        mapReduce: true,
        systemPrompt: "Custom reduce prompt.",
      },
      llmModelProvider,
    });

    const [mapCall1, , , reduceCall] = calls();
    expect(extractSystemText(mapCall1!)).toBe(
      DEFAULT_MAP_REDUCE_MAP_SYSTEM_PROMPT,
    );
    expect(extractSystemText(reduceCall!)).toBe("Custom reduce prompt.");
  });

  it("includes team, commits, and paths context in the reduce call", async () => {
    const { llmModelProvider, calls } = provideSequentialMock([
      "b1",
      "b2",
      "b3",
      "FINAL",
    ]);

    await generateSummary({
      diffText: threeFileDiff,
      fileNames: ["a.ts", "b.ts", "c.ts"],
      commits,
      flags: { ...flagsBase, maxDiffChars: 10, mapReduce: true, team: "QA" },
      llmModelProvider,
    });

    const reduceCall = calls().at(-1)!;
    const reduceUserText = extractUserText(reduceCall);
    expect(reduceUserText).toContain("Team: QA");
    expect(reduceUserText).toContain("deadbeef".slice(0, 7));
    expect(reduceUserText).toContain("a.ts\nb.ts\nc.ts");
  });
});

describe("generateSummary maxRetries (real SDK retry path)", () => {
  const commits: CommitInfo[] = [
    { hash: "deadbeef", message: "feat: example" },
  ];
  const flagsBase = { from: "main", to: "HEAD" };

  it("does not retry when maxRetries is 0", async () => {
    const { llmModelProvider, attemptCount } = provideFlakyMock(1, "recovered");

    await expect(
      generateSummary({
        diffText: "d",
        fileNames: [],
        commits,
        flags: { ...flagsBase, maxRetries: 0 },
        llmModelProvider,
      }),
    ).rejects.toThrow();

    expect(attemptCount()).toBe(1);
  });
});
