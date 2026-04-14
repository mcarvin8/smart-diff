import * as gitDiff from "../src/git/gitDiff";
import type { OpenAiLikeClient } from "../src/ai/openAIConfig";
import { summarizeGitDiff } from "../src/index";

describe("summarizeGitDiff integration", () => {
  const originalEnv = process.env;

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it("uses createGitClient when git is omitted", async () => {
    const mockGit = {
      log: jest.fn().mockResolvedValue({ all: [{ hash: "h1", message: "m" }] }),
      revparse: jest.fn().mockResolvedValue("C:\\repo\n"),
      diff: jest.fn().mockResolvedValue(""),
      show: jest.fn().mockResolvedValue(""),
    };

    const createSpy = jest
      .spyOn(gitDiff, "createGitClient")
      .mockReturnValue(mockGit as never);

    const openAiClientProvider = async (): Promise<OpenAiLikeClient> =>
      ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: "summary" } }],
            }),
          },
        },
      }) as OpenAiLikeClient;

    await summarizeGitDiff({
      from: "a",
      to: "b",
      cwd: "C:\\some\\cwd",
      openAiClientProvider,
    });

    expect(createSpy).toHaveBeenCalledWith("C:\\some\\cwd");
    expect(mockGit.log).toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it("uses per-commit diff when filtered commits differ without regex options", async () => {
    jest.spyOn(gitDiff, "getCommits").mockResolvedValue([
      { hash: "1", message: "a" },
      { hash: "2", message: "b" },
    ]);
    jest
      .spyOn(gitDiff, "filterCommitsByMessageRegexes")
      .mockReturnValue([{ hash: "1", message: "a" }]);

    const diff = jest.fn().mockImplementation(async (args: string[]) => {
      if (args.includes("--numstat")) return "1\t1\tf.ts";
      if (args.includes("--name-status")) return "M\tf.ts";
      if (args.includes("--name-only")) return "f.ts\n";
      return "";
    });
    const mockGit = {
      log: jest.fn(),
      revparse: jest.fn().mockResolvedValue("C:\\repo\n"),
      diff,
      show: jest.fn().mockResolvedValue("f.ts\n"),
    } as never;

    jest.spyOn(gitDiff, "createGitClient").mockReturnValue(mockGit);

    const openAiClientProvider = async (): Promise<OpenAiLikeClient> =>
      ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: "ok" } }],
            }),
          },
        },
      }) as OpenAiLikeClient;

    await summarizeGitDiff({
      from: "x",
      to: "y",
      cwd: ".",
      openAiClientProvider,
    });

    expect(diff).toHaveBeenCalledWith(expect.arrayContaining(["1^!"]));
  });
});
