import { join } from "node:path";
import type { LanguageModel } from "ai";
import type { SimpleGit } from "simple-git";
import type { Mock } from "vitest";

import { summarizeGitDiff } from "../src/index";
import { makeMockModel } from "./helpers/mockLlm";

function createMockGit(repoRoot: string): SimpleGit {
  const diff = vi.fn().mockImplementation(async (args: string[]) => {
    if (args.includes("--name-only")) return "src/app.ts\n";
    if (args.includes("--numstat")) return "2\t1\tsrc/app.ts\n";
    if (args.includes("--name-status")) return "M\tsrc/app.ts\n";
    return "diff --git a/src/app.ts\n+ok";
  });

  return {
    log: vi.fn().mockResolvedValue({
      all: [
        { hash: "aaa111", message: "feat: one" },
        { hash: "bbb222", message: "chore: noise" },
      ],
    }),
    revparse: vi.fn().mockResolvedValue(`${repoRoot}\n`),
    diff,
    show: vi.fn().mockResolvedValue(""),
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

    const diffCalls = (git.diff as unknown as Mock).mock.calls.map(
      (c) => c[0] as string[],
    );
    const hasPerCommitPatch = diffCalls.some((args) =>
      args.some((x) => /^\w+\^!$/.test(x)),
    );
    expect(hasPerCommitPatch).toBe(true);
  });

  const SUMMARY_MODE_FLAGS = ["--numstat", "--name-status", "--name-only"];

  function findPatchCall(diffCalls: string[][]): string[] | undefined {
    return diffCalls.find(
      (args) =>
        args.includes("a..b") &&
        !SUMMARY_MODE_FLAGS.some((f) => args.includes(f)),
    );
  }

  it("forwards flat shaping options to git diff", async () => {
    const git = createMockGit(repoRoot);

    await summarizeGitDiff({
      from: "a",
      to: "b",
      git,
      contextLines: 0,
      ignoreWhitespace: true,
      stripDiffPreamble: true,
      maxHunkLines: 200,
      llmModelProvider: mockLlmProvider("ok"),
    });

    const diffCalls = (git.diff as unknown as Mock).mock.calls.map(
      (c) => c[0] as string[],
    );
    const patchCall = findPatchCall(diffCalls);
    expect(patchCall).toEqual(["-U0", "-w", "a..b", "--", "."]);
    const numstatCall = diffCalls.find(
      (args) => args.includes("--numstat") && args.includes("a..b"),
    );
    expect(numstatCall?.[0]).toBe("-w");
  });

  it("merges excludeDefaultNoise into excludeFolders and deduplicates user entries", async () => {
    const git = createMockGit(repoRoot);

    await summarizeGitDiff({
      from: "a",
      to: "b",
      git,
      excludeFolders: ["node_modules", "custom-out"],
      excludeDefaultNoise: true,
      llmModelProvider: mockLlmProvider("ok"),
    });

    const diffCalls = (git.diff as unknown as Mock).mock.calls.map(
      (c) => c[0] as string[],
    );
    const patchCall = findPatchCall(diffCalls);
    expect(patchCall).toBeDefined();
    const excludes = (patchCall ?? []).filter((a) =>
      a.startsWith(":(exclude)"),
    );
    expect(excludes).toContain(":(exclude)package-lock.json");
    expect(excludes).toContain(":(exclude)custom-out");
    const nodeModulesCount = excludes.filter(
      (e) => e === ":(exclude)node_modules",
    ).length;
    expect(nodeModulesCount).toBe(1);
  });

  it("ignores blank/duplicate entries when merging default noise excludes", async () => {
    const git = createMockGit(repoRoot);

    await summarizeGitDiff({
      from: "a",
      to: "b",
      git,
      excludeFolders: ["  ", "custom-out", "custom-out"],
      excludeDefaultNoise: true,
      llmModelProvider: mockLlmProvider("ok"),
    });

    const diffCalls = (git.diff as unknown as Mock).mock.calls.map(
      (c) => c[0] as string[],
    );
    const patchCall = findPatchCall(diffCalls);
    const customCount = (patchCall ?? []).filter(
      (e) => e === ":(exclude)custom-out",
    ).length;
    expect(customCount).toBe(1);
  });

  it("merges default noise excludes even when no user excludes are supplied", async () => {
    const git = createMockGit(repoRoot);

    await summarizeGitDiff({
      from: "a",
      to: "b",
      git,
      excludeDefaultNoise: true,
      llmModelProvider: mockLlmProvider("ok"),
    });

    const diffCalls = (git.diff as unknown as Mock).mock.calls.map(
      (c) => c[0] as string[],
    );
    const patchCall = findPatchCall(diffCalls);
    const excludes = (patchCall ?? []).filter((a) =>
      a.startsWith(":(exclude)"),
    );
    expect(excludes).toContain(":(exclude)package-lock.json");
  });

  it("leaves path filter untouched when excludeDefaultNoise is not set", async () => {
    const git = createMockGit(repoRoot);

    await summarizeGitDiff({
      from: "a",
      to: "b",
      git,
      llmModelProvider: mockLlmProvider("ok"),
    });

    const diffCalls = (git.diff as unknown as Mock).mock.calls.map(
      (c) => c[0] as string[],
    );
    const patchCall = findPatchCall(diffCalls);
    expect(patchCall).toBeDefined();
    expect(
      (patchCall ?? []).some((a) => a.startsWith(":(exclude)")),
    ).toBe(false);
  });
});
