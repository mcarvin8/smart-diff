import type { LanguageModel } from "ai";
import type { Mock } from "vitest";

import * as gitDiff from "../src/git/gitDiff";
import { summarizeGitDiff, summarizeGitDiffWithUsage } from "../src/index";
import { makeMockModel, makeUsageMockProvider } from "./helpers/mockLlm";

function mockLlmProvider(text: string): () => Promise<LanguageModel> {
  return async () => makeMockModel(text).model;
}

describe("summarizeGitDiff integration", () => {
  const originalEnv = process.env;

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it("uses createGitClient when git is omitted", async () => {
    const mockGit = {
      run: vi.fn().mockImplementation(async (args: string[]) => {
        if (args[0] === "log") return "h1\x1fm\n";
        if (args[0] === "rev-parse") return "C:\\repo\n";
        return "";
      }),
    };

    const createSpy = vi
      .spyOn(gitDiff, "createGitClient")
      .mockReturnValue(mockGit as never);

    await summarizeGitDiff({
      from: "a",
      to: "b",
      cwd: "C:\\some\\cwd",
      llmModelProvider: mockLlmProvider("summary"),
    });

    expect(createSpy).toHaveBeenCalledWith("C:\\some\\cwd");
    expect(mockGit.run).toHaveBeenCalledWith(expect.arrayContaining(["log"]));
    createSpy.mockRestore();
  });

  it("uses per-commit diff shape when filtered commits differ without regex options", async () => {
    vi.spyOn(gitDiff, "getCommits").mockResolvedValue([
      { hash: "1", message: "a" },
      { hash: "2", message: "b" },
    ]);
    vi.spyOn(gitDiff, "filterCommitsByMessageRegexes").mockReturnValue([
      { hash: "1", message: "a" },
    ]);

    const run = vi.fn().mockImplementation(async (args: string[]) => {
      if (args[0] === "rev-parse") return "C:\\repo\n";
      if (args[0] === "show") return "f.ts\n";
      if (args.includes("--numstat")) return "1\t1\tf.ts";
      if (args.includes("--name-status")) return "M\tf.ts";
      if (args.includes("--name-only")) return "f.ts\n";
      return "";
    });
    const mockGit = { run } as never;

    vi.spyOn(gitDiff, "createGitClient").mockReturnValue(mockGit);

    await summarizeGitDiff({
      from: "x",
      to: "y",
      cwd: ".",
      llmModelProvider: mockLlmProvider("ok"),
    });

    expect(run).toHaveBeenCalledWith(expect.arrayContaining(["1^!"]));
  });

  it("summarizeGitDiffWithUsage returns the summary alongside aggregated token usage", async () => {
    const mockGit = {
      run: vi.fn().mockImplementation(async (args: string[]) => {
        if (args[0] === "log") return "h1\x1fm\n";
        if (args[0] === "rev-parse") return "C:\\repo\n";
        return "";
      }),
    };
    vi.spyOn(gitDiff, "createGitClient").mockReturnValue(mockGit as never);

    const { llmModelProvider } = makeUsageMockProvider([
      { text: "summary", inputTokens: 42, outputTokens: 8 },
    ]);

    const { summary, usage } = await summarizeGitDiffWithUsage({
      from: "a",
      to: "b",
      cwd: "C:\\some\\cwd",
      llmModelProvider,
    });

    expect(summary).toBe("summary");
    expect(usage).toEqual({
      requestCount: 1,
      inputTokens: 42,
      outputTokens: 8,
      totalTokens: 50,
      cachedInputTokens: 0,
    });
  });
});
