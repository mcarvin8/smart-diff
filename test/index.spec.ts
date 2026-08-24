import type { ChatModel } from "../src/ai/llmClient";
import * as gitDiff from "../src/git/index";
import { summarizeGitDiff } from "../src/index";
import { extractUserText, makeMockModel } from "./helpers/mockLlm";
import { createFixtureRepo, type FixtureRepo } from "./helpers/tsgitFixture";

function mockLlmProvider(text: string): () => Promise<ChatModel> {
  return async () => makeMockModel(text).model;
}

describe("summarizeGitDiff", () => {
  let fx: FixtureRepo;

  beforeEach(async () => {
    fx = await createFixtureRepo();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fx.cleanup();
  });

  it("aggregates git calls and returns LLM summary via llmModelProvider", async () => {
    const c1 = await fx.commit("root", {
      "src/app.ts": "one\n",
      "node_modules/pkg.js": "vendored\n",
    });
    const c2 = await fx.commit("chore: noise", {
      "src/app.ts": "two\n",
      "node_modules/pkg.js": "vendored2\n",
    });

    const { summary } = await summarizeGitDiff({
      from: c1,
      to: c2,
      git: fx.repo,
      teamName: "Infra",
      excludeFolders: ["node_modules"],
      commitMessageExcludeRegexes: ["^chore:"],
      llmModelProvider: mockLlmProvider("# Infra Summary\nBody from model"),
    });

    expect(summary).toBe("# Infra Summary\nBody from model");
  });

  it("uses per-commit diff shape when include regexes are set even if all match", async () => {
    const c1 = await fx.commit("root", { "a.ts": "1\n" });
    const c2 = await fx.commit("edit", { "a.ts": "2\n" });
    const getDiffSpy = vi.spyOn(gitDiff, "getDiff");

    await summarizeGitDiff({
      from: c1,
      to: c2,
      git: fx.repo,
      commitMessageIncludeRegexes: ["."],
      llmModelProvider: mockLlmProvider("ok"),
    });

    expect(getDiffSpy).toHaveBeenCalledWith(
      fx.repo,
      expect.objectContaining({ filterByCommits: true }),
    );
  });

  it("forwards shaping options through to getDiff's query", async () => {
    const c1 = await fx.commit("root", { "a.ts": "1\n2\n3\n" });
    const c2 = await fx.commit("edit", { "a.ts": "1\n2b\n3\n" });
    const getDiffSpy = vi.spyOn(gitDiff, "getDiff");

    await summarizeGitDiff({
      from: c1,
      to: c2,
      git: fx.repo,
      contextLines: 0,
      ignoreWhitespace: true,
      stripDiffPreamble: true,
      maxHunkLines: 200,
      llmModelProvider: mockLlmProvider("ok"),
    });

    expect(getDiffSpy).toHaveBeenCalledWith(
      fx.repo,
      expect.objectContaining({
        shaping: expect.objectContaining({
          contextLines: 0,
          ignoreWhitespace: true,
          stripDiffPreamble: true,
          maxHunkLines: 200,
        }),
      }),
    );
  });

  it("merges excludeDefaultNoise into excludeFolders and deduplicates user entries", async () => {
    const c1 = await fx.commit("root", { "a.ts": "1\n" });
    const c2 = await fx.commit("edit", { "a.ts": "2\n" });
    const getDiffSpy = vi.spyOn(gitDiff, "getDiff");

    await summarizeGitDiff({
      from: c1,
      to: c2,
      git: fx.repo,
      excludeFolders: ["node_modules", "custom-out"],
      excludeDefaultNoise: true,
      llmModelProvider: mockLlmProvider("ok"),
    });

    const query = getDiffSpy.mock.calls[0]?.[1];
    const excludes = query?.pathFilter?.excludeFolders ?? [];
    expect(excludes).toContain("package-lock.json");
    expect(excludes).toContain("custom-out");
    expect(excludes.filter((e) => e === "node_modules")).toHaveLength(1);
  });

  it("leaves path filter untouched when excludeDefaultNoise is not set", async () => {
    const c1 = await fx.commit("root", { "a.ts": "1\n" });
    const c2 = await fx.commit("edit", { "a.ts": "2\n" });
    const getDiffSpy = vi.spyOn(gitDiff, "getDiff");

    await summarizeGitDiff({
      from: c1,
      to: c2,
      git: fx.repo,
      llmModelProvider: mockLlmProvider("ok"),
    });

    const query = getDiffSpy.mock.calls[0]?.[1];
    expect(query?.pathFilter).toBeUndefined();
  });

  it("actually excludes noise paths from the diff sent to the LLM", async () => {
    const c1 = await fx.commit("root", {
      "package-lock.json": "{}\n",
      "src/app.ts": "1\n",
    });
    const c2 = await fx.commit("edit", {
      "package-lock.json": '{"a":1}\n',
      "src/app.ts": "2\n",
    });

    const { model, calls } = makeMockModel("ok");
    await summarizeGitDiff({
      from: c1,
      to: c2,
      git: fx.repo,
      excludeDefaultNoise: true,
      llmModelProvider: async () => model,
    });

    const userText = extractUserText(calls()[0]!);
    expect(userText).not.toContain("package-lock.json");
    expect(userText).toContain("src/app.ts");
  });
});
