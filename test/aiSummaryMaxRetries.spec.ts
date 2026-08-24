import { generateSummary } from "../src/ai/aiSummary";
import type { ChatModel } from "../src/ai/llmClient";
import * as llmClient from "../src/ai/llmClient";
import type { CommitInfo } from "../src/git/index";

const generateTextSpy = vi.spyOn(llmClient, "generateText");
const dummyProvider = async (): Promise<ChatModel> => ({
  generate: async () => ({ text: "unused", usage: {} }),
});

describe("generateSummary maxRetries wiring", () => {
  const commits: CommitInfo[] = [
    { hash: "deadbeef", message: "feat: example" },
  ];
  const flagsBase = { from: "main", to: "HEAD" };
  const prevEnv = process.env.LLM_MAX_RETRIES;

  beforeEach(() => {
    generateTextSpy.mockReset();
    generateTextSpy.mockResolvedValue({ text: "ok", usage: {} });
  });

  afterAll(() => {
    generateTextSpy.mockRestore();
    if (prevEnv === undefined) delete process.env.LLM_MAX_RETRIES;
    else process.env.LLM_MAX_RETRIES = prevEnv;
  });

  it("passes the default maxRetries (2) to generateText when unset", async () => {
    delete process.env.LLM_MAX_RETRIES;

    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits,
      flags: flagsBase,
      llmModelProvider: dummyProvider,
    });

    expect(generateTextSpy).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 2 }),
    );
  });

  it("passes an explicit flags.maxRetries override to generateText", async () => {
    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits,
      flags: { ...flagsBase, maxRetries: 5 },
      llmModelProvider: dummyProvider,
    });

    expect(generateTextSpy).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 5 }),
    );
  });

  it("honors LLM_MAX_RETRIES from env when flags.maxRetries is unset", async () => {
    process.env.LLM_MAX_RETRIES = "6";

    await generateSummary({
      diffText: "d",
      fileNames: [],
      commits,
      flags: flagsBase,
      llmModelProvider: dummyProvider,
    });

    expect(generateTextSpy).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 6 }),
    );
  });

  it("passes the resolved maxRetries to every map and reduce call", async () => {
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

    await generateSummary({
      diffText,
      fileNames: ["a.ts", "b.ts"],
      commits,
      flags: {
        ...flagsBase,
        maxDiffChars: 10,
        mapReduce: true,
        maxRetries: 9,
      },
      llmModelProvider: dummyProvider,
    });

    expect(generateTextSpy).toHaveBeenCalledTimes(3); // 2 map batches + 1 reduce
    for (const call of generateTextSpy.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ maxRetries: 9 }));
    }
  });
});
