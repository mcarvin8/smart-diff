import type { LanguageModel } from "ai";

import * as gitDiff from "../src/git/gitDiff";
import { summarizeGitDiff } from "../src/index";
import { makeMockModel } from "./helpers/mockLlm";

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
      log: vi.fn().mockResolvedValue({ all: [{ hash: "h1", message: "m" }] }),
      revparse: vi.fn().mockResolvedValue("C:\\repo\n"),
      diff: vi.fn().mockResolvedValue(""),
      show: vi.fn().mockResolvedValue(""),
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
    expect(mockGit.log).toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it("uses per-commit diff when filtered commits differ without regex options", async () => {
    vi.spyOn(gitDiff, "getCommits").mockResolvedValue([
      { hash: "1", message: "a" },
      { hash: "2", message: "b" },
    ]);
    vi.spyOn(gitDiff, "filterCommitsByMessageRegexes").mockReturnValue([
      { hash: "1", message: "a" },
    ]);

    const diff = vi.fn().mockImplementation(async (args: string[]) => {
      if (args.includes("--numstat")) return "1\t1\tf.ts";
      if (args.includes("--name-status")) return "M\tf.ts";
      if (args.includes("--name-only")) return "f.ts\n";
      return "";
    });
    const mockGit = {
      log: vi.fn(),
      revparse: vi.fn().mockResolvedValue("C:\\repo\n"),
      diff,
      show: vi.fn().mockResolvedValue("f.ts\n"),
    } as never;

    vi.spyOn(gitDiff, "createGitClient").mockReturnValue(mockGit);

    await summarizeGitDiff({
      from: "x",
      to: "y",
      cwd: ".",
      llmModelProvider: mockLlmProvider("ok"),
    });

    expect(diff).toHaveBeenCalledWith(expect.arrayContaining(["1^!"]));
  });
});
