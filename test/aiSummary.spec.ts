import type { CommitInfo } from "../src/git/gitDiff";
import {
  generateSummary,
  resolveLlmMaxDiffChars,
  truncateUnifiedDiffForLlm,
} from "../src/ai/aiSummary";
import {
  DEFAULT_GIT_DIFF_SYSTEM_PROMPT,
  LLM_GATEWAY_REQUIRED_MESSAGE,
} from "../src/ai/aiConstants";
import * as llmProviders from "../src/ai/llmProviders";
import {
  extractSystemText,
  extractUserText,
  makeMockModel as mockModel,
  makeMockProvider as provideMock,
} from "./helpers/mockLlm";

describe("resolveLlmMaxDiffChars", () => {
  const original = process.env.LLM_MAX_DIFF_CHARS;

  afterEach(() => {
    if (original === undefined) delete process.env.LLM_MAX_DIFF_CHARS;
    else process.env.LLM_MAX_DIFF_CHARS = original;
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

  it("falls back to default when env invalid", () => {
    process.env.LLM_MAX_DIFF_CHARS = "not-a-number";
    expect(resolveLlmMaxDiffChars()).toBe(120_000);
  });

  it("ignores NaN cli override", () => {
    process.env.LLM_MAX_DIFF_CHARS = "500";
    expect(resolveLlmMaxDiffChars(Number.NaN)).toBe(500);
  });
});

describe("truncateUnifiedDiffForLlm", () => {
  it("returns input unchanged when under limit", () => {
    expect(truncateUnifiedDiffForLlm("abc", 10)).toBe("abc");
  });

  it("truncates and appends marker when over limit", () => {
    const long = "x".repeat(100);
    const out = truncateUnifiedDiffForLlm(long, 20);
    expect(out.startsWith("x".repeat(20))).toBe(true);
    expect(out).toContain("TRUNCATED");
    expect(out.length).toBeGreaterThan(20);
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
    jest.restoreAllMocks();
  });

  it("throws when no provider is configured and no injection", async () => {
    jest
      .spyOn(llmProviders, "isLlmProviderConfigured")
      .mockReturnValue(false);

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
    jest
      .spyOn(llmProviders, "isLlmProviderConfigured")
      .mockReturnValue(false);

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
    jest
      .spyOn(llmProviders, "isLlmProviderConfigured")
      .mockReturnValue(true);
    const { model, calls } = mockModel("  **Summary** from env  ");
    jest
      .spyOn(llmProviders, "resolveLanguageModel")
      .mockResolvedValue(model);

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
    jest
      .spyOn(llmProviders, "isLlmProviderConfigured")
      .mockReturnValue(true);
    const { model } = mockModel("ok");
    const spy = jest
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
});
