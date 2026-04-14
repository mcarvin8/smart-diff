import type { CommitInfo } from "../src/git/gitDiff";
import * as openAIConfig from "../src/ai/openAIConfig";
import {
  DEFAULT_GIT_DIFF_SYSTEM_PROMPT,
  generateSummary,
  LLM_GATEWAY_REQUIRED_MESSAGE,
  resolveLlmMaxDiffChars,
  truncateUnifiedDiffForLlm,
} from "../src/ai/aiSummary";

function mockLlmClient(
  content: string,
): () => Promise<import("../src/ai/openAIConfig").OpenAiLikeClient> {
  return async () =>
    ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: content } }],
          }),
        },
      },
    }) as import("../src/ai/openAIConfig").OpenAiLikeClient;
}

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
    expect(LLM_GATEWAY_REQUIRED_MESSAGE).toContain("OPENAI_API_KEY");
    expect(LLM_GATEWAY_REQUIRED_MESSAGE).toContain("openAiClientProvider");
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

  it("throws when LLM gateway is off and no client provider", async () => {
    jest.spyOn(openAIConfig, "shouldUseLlmGateway").mockReturnValue(false);

    await expect(
      generateSummary("+added line", ["src/a.ts"], commits, flagsBase),
    ).rejects.toThrow(LLM_GATEWAY_REQUIRED_MESSAGE);
  });

  it("uses openAiClientProvider when gateway env is off", async () => {
    jest.spyOn(openAIConfig, "shouldUseLlmGateway").mockReturnValue(false);

    const md = await generateSummary(
      "diff...",
      ["f.ts"],
      commits,
      {
        ...flagsBase,
        team: "QA",
        systemPrompt: "You are a test bot.",
        model: "gpt-test",
        maxDiffChars: 1000,
      },
      mockLlmClient("  **Summary** from inject  "),
    );

    expect(md).toBe("**Summary** from inject");
  });

  it("calls OpenAI-compatible client when gateway is on", async () => {
    jest.spyOn(openAIConfig, "shouldUseLlmGateway").mockReturnValue(true);
    const completionCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: "  **Summary** from model  " } }],
    });
    jest.spyOn(openAIConfig, "createOpenAiLikeClient").mockResolvedValue({
      chat: {
        completions: {
          create: completionCreate,
        },
      },
    } as Awaited<ReturnType<typeof openAIConfig.createOpenAiLikeClient>>);

    const md = await generateSummary("diff...", ["f.ts"], commits, {
      ...flagsBase,
      team: "QA",
      systemPrompt: "You are a test bot.",
      model: "gpt-test",
      maxDiffChars: 1000,
    });

    expect(md).toBe("**Summary** from model");
    expect(completionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-test",
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: "You are a test bot.",
          }),
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("Team: QA"),
          }),
        ]),
      }),
    );
  });

  it("defaults model to gpt-4o-mini when omitted", async () => {
    jest.spyOn(openAIConfig, "shouldUseLlmGateway").mockReturnValue(true);
    const completionCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
    });
    jest.spyOn(openAIConfig, "createOpenAiLikeClient").mockResolvedValue({
      chat: { completions: { create: completionCreate } },
    } as Awaited<ReturnType<typeof openAIConfig.createOpenAiLikeClient>>);

    await generateSummary("d", [], [], flagsBase);
    expect(completionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini" }),
    );
  });

  it("includes exclude-only commit filter copy in user message", async () => {
    jest.spyOn(openAIConfig, "shouldUseLlmGateway").mockReturnValue(true);
    const completionCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: "x" } }],
    });
    jest.spyOn(openAIConfig, "createOpenAiLikeClient").mockResolvedValue({
      chat: { completions: { create: completionCreate } },
    } as Awaited<ReturnType<typeof openAIConfig.createOpenAiLikeClient>>);

    await generateSummary("d", [], [], {
      ...flagsBase,
      commitMessageExcludeRegexes: ["^WIP"],
    });
    const userMsg = completionCreate.mock.calls[0]![0].messages.find(
      (m: { role: string }) => m.role === "user",
    )?.content as string;
    expect(userMsg).toContain("Commit message exclude regexes");
    expect(userMsg).not.toContain("include regexes");
  });

  it("omits team line when team is blank", async () => {
    jest.spyOn(openAIConfig, "shouldUseLlmGateway").mockReturnValue(true);
    const completionCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: "x" } }],
    });
    jest.spyOn(openAIConfig, "createOpenAiLikeClient").mockResolvedValue({
      chat: { completions: { create: completionCreate } },
    } as Awaited<ReturnType<typeof openAIConfig.createOpenAiLikeClient>>);

    await generateSummary("d", [], [], { ...flagsBase, team: "   " });
    const userMsg = completionCreate.mock.calls[0]![0].messages.find(
      (m: { role: string }) => m.role === "user",
    )?.content as string;
    expect(userMsg).not.toMatch(/^Team:/m);
  });

  it("embeds diffSummary JSON when provided", async () => {
    jest.spyOn(openAIConfig, "shouldUseLlmGateway").mockReturnValue(true);
    const completionCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: "x" } }],
    });
    jest.spyOn(openAIConfig, "createOpenAiLikeClient").mockResolvedValue({
      chat: { completions: { create: completionCreate } },
    } as Awaited<ReturnType<typeof openAIConfig.createOpenAiLikeClient>>);

    const diffSummary = {
      files: [],
      totalFiles: 0,
      totalAdditions: 0,
      totalDeletions: 0,
    };
    await generateSummary("d", [], [], flagsBase, undefined, diffSummary);
    const userMsg = completionCreate.mock.calls[0]![0].messages.find(
      (m: { role: string }) => m.role === "user",
    )?.content as string;
    expect(userMsg).toContain("Structured git context");
    expect(userMsg).toContain('"totalFiles": 0');
  });

  it("returns placeholder when model returns empty content", async () => {
    jest.spyOn(openAIConfig, "shouldUseLlmGateway").mockReturnValue(true);
    jest.spyOn(openAIConfig, "createOpenAiLikeClient").mockResolvedValue({
      chat: {
        completions: {
          create: jest
            .fn()
            .mockResolvedValue({ choices: [{ message: { content: "   " } }] }),
        },
      },
    } as Awaited<ReturnType<typeof openAIConfig.createOpenAiLikeClient>>);

    const md = await generateSummary("d", [], [], flagsBase);
    expect(md).toBe("No summary generated by OpenAI.");
  });

  it("uses 4000 max_tokens when OPENAI_MAX_TOKENS is invalid", async () => {
    const prev = process.env.OPENAI_MAX_TOKENS;
    process.env.OPENAI_MAX_TOKENS = "not-int";
    jest.spyOn(openAIConfig, "shouldUseLlmGateway").mockReturnValue(true);
    const completionCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
    });
    jest.spyOn(openAIConfig, "createOpenAiLikeClient").mockResolvedValue({
      chat: { completions: { create: completionCreate } },
    } as Awaited<ReturnType<typeof openAIConfig.createOpenAiLikeClient>>);

    await generateSummary("d", [], [], flagsBase);
    expect(completionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 4000 }),
    );
    if (prev === undefined) delete process.env.OPENAI_MAX_TOKENS;
    else process.env.OPENAI_MAX_TOKENS = prev;
  });
});
