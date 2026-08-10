import { generateSummary, generateSummaryWithUsage } from "../src/ai/aiSummary";
import type { CommitInfo } from "../src/git/index";
import {
  makeMockProvider as provideMock,
  makeUsageMockProvider as provideUsageMock,
} from "./helpers/mockLlm";

describe("generateSummaryWithUsage", () => {
  const commits: CommitInfo[] = [
    { hash: "deadbeef", message: "feat: example" },
  ];
  const flagsBase = { from: "main", to: "HEAD" };

  it("reports usage for a single-shot call", async () => {
    const { llmModelProvider } = provideUsageMock([
      { text: "summary", inputTokens: 120, outputTokens: 40 },
    ]);

    const { summary, usage } = await generateSummaryWithUsage({
      diffText: "d",
      fileNames: [],
      commits,
      flags: flagsBase,
      llmModelProvider,
    });

    expect(summary).toBe("summary");
    expect(usage).toEqual({
      requestCount: 1,
      inputTokens: 120,
      outputTokens: 40,
      totalTokens: 160,
      cachedInputTokens: 0,
    });
  });

  it("includes cachedInputTokens when the provider reports cache reads", async () => {
    const { llmModelProvider } = provideUsageMock([
      {
        text: "summary",
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 30,
      },
    ]);

    const { usage } = await generateSummaryWithUsage({
      diffText: "d",
      fileNames: [],
      commits,
      flags: flagsBase,
      llmModelProvider,
    });

    expect(usage.cachedInputTokens).toBe(30);
  });

  it("treats an undefined provider usage as all zeros without throwing", async () => {
    const { llmModelProvider } = provideMock("summary");

    const { usage } = await generateSummaryWithUsage({
      diffText: "d",
      fileNames: [],
      commits,
      flags: flagsBase,
      llmModelProvider,
    });

    expect(usage.requestCount).toBe(1);
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
  });

  it("sums usage across every map batch and the reduce call", async () => {
    const fileDiff = (name: string) =>
      [
        `diff --git a/${name} b/${name}`,
        "index abc..def 100644",
        `--- a/${name}`,
        `+++ b/${name}`,
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new",
      ].join("\n");
    const diffText = [fileDiff("a.ts"), fileDiff("b.ts")].join("\n");

    const { llmModelProvider } = provideUsageMock([
      { text: "batch1", inputTokens: 50, outputTokens: 10 },
      { text: "batch2", inputTokens: 60, outputTokens: 20 },
      { text: "FINAL", inputTokens: 200, outputTokens: 80 },
    ]);

    const { summary, usage } = await generateSummaryWithUsage({
      diffText,
      fileNames: ["a.ts", "b.ts"],
      commits,
      flags: { ...flagsBase, maxDiffChars: 10, mapReduce: true },
      llmModelProvider,
    });

    expect(summary).toContain("FINAL");
    expect(usage).toEqual({
      requestCount: 3,
      inputTokens: 50 + 60 + 200,
      outputTokens: 10 + 20 + 80,
      totalTokens: 60 + 80 + 280,
      cachedInputTokens: 0,
    });
  });

  it("generateSummary (string-returning) stays unaffected by usage tracking", async () => {
    const { llmModelProvider } = provideUsageMock([
      { text: "  plain summary  ", inputTokens: 10, outputTokens: 5 },
    ]);

    const md = await generateSummary({
      diffText: "d",
      fileNames: [],
      commits,
      flags: flagsBase,
      llmModelProvider,
    });

    expect(md).toBe("plain summary");
  });
});
