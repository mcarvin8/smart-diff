import { join } from "node:path";
import type { LanguageModel } from "ai";
import type { SimpleGit } from "simple-git";

import { summarizeGitDiff } from "../src/index";
import { makeMockModel } from "./helpers/mockLlm";

function createMockGit(repoRoot: string): SimpleGit {
  const diff = jest.fn().mockImplementation(async (args: string[]) => {
    if (args.includes("--name-only")) return "src/app.ts\n";
    if (args.includes("--numstat")) return "2\t1\tsrc/app.ts\n";
    if (args.includes("--name-status")) return "M\tsrc/app.ts\n";
    return "diff --git a/src/app.ts\n+ok";
  });

  return {
    log: jest.fn().mockResolvedValue({
      all: [
        { hash: "aaa111", message: "feat: one" },
        { hash: "bbb222", message: "chore: noise" },
      ],
    }),
    revparse: jest.fn().mockResolvedValue(`${repoRoot}\n`),
    diff,
    show: jest.fn().mockResolvedValue(""),
  } as unknown as SimpleGit;
}

function mockLlmProvider(text: string): () => Promise<LanguageModel> {
  return async () => makeMockModel(text).model;
}

describe("summarizeGitDiff", () => {
  const repoRoot = join(__dirname, "fixture-repo-root");

  it("aggregates git calls and returns LLM summary via llmModelProvider", async () => {
    const git = createMockGit(repoRoot);

    const md = await summarizeGitDiff({
      from: "main",
      to: "topic",
      git,
      teamName: "Infra",
      excludeFolders: ["node_modules"],
      commitMessageExcludeRegexes: ["^chore:"],
      llmModelProvider: mockLlmProvider("# Infra Summary\nBody from model"),
    });

    expect(git.log).toHaveBeenCalledWith({ from: "main", to: "topic" });
    expect(md).toBe("# Infra Summary\nBody from model");
    expect(git.diff).toHaveBeenCalled();
  });

  it("uses per-commit diff shape when include regexes are set even if all match", async () => {
    const git = createMockGit(repoRoot);

    await summarizeGitDiff({
      from: "a",
      to: "b",
      git,
      commitMessageIncludeRegexes: ["."],
      llmModelProvider: mockLlmProvider("ok"),
    });

    const diffCalls = (git.diff as jest.Mock).mock.calls.map(
      (c) => c[0] as string[],
    );
    const hasPerCommitPatch = diffCalls.some((args) =>
      args.some((x) => /^\w+\^!$/.test(x)),
    );
    expect(hasPerCommitPatch).toBe(true);
  });
});
