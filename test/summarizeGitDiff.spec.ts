import type { LanguageModel } from "ai";

import * as gitDiff from "../src/git/index";
import { summarizeGitDiff } from "../src/index";
import { makeMockModel, makeUsageMockProvider } from "./helpers/mockLlm";
import { createFixtureRepo, type FixtureRepo } from "./helpers/tsgitFixture";

function mockLlmProvider(text: string): () => Promise<LanguageModel> {
  return async () => makeMockModel(text).model;
}

describe("summarizeGitDiff integration", () => {
  let fx: FixtureRepo;

  beforeEach(async () => {
    fx = await createFixtureRepo();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fx.cleanup();
  });

  it("uses createGitClient when git is omitted", async () => {
    const c1 = await fx.commit("root", { "a.ts": "1\n" });
    const c2 = await fx.commit("edit", { "a.ts": "2\n" });

    const createSpy = vi.spyOn(gitDiff, "createGitClient");

    const { summary } = await summarizeGitDiff({
      from: c1,
      to: c2,
      cwd: fx.dir,
      llmModelProvider: mockLlmProvider("summary"),
    });

    expect(createSpy).toHaveBeenCalledWith(fx.dir);
    expect(summary).toBe("summary");
  });

  it("uses per-commit diff shape when filtered commits differ without regex options", async () => {
    const c1 = await fx.commit("root", { "a.ts": "1\n" });
    await fx.commit("edit1", { "a.ts": "2\n" });
    const c3 = await fx.commit("edit2", { "a.ts": "3\n" });

    vi.spyOn(gitDiff, "filterCommitsByMessageRegexes").mockImplementation(
      (commits) => commits.slice(0, 1),
    );
    const getDiffSpy = vi.spyOn(gitDiff, "getDiff");

    await summarizeGitDiff({
      from: c1,
      to: c3,
      git: fx.repo,
      llmModelProvider: mockLlmProvider("ok"),
    });

    expect(getDiffSpy).toHaveBeenCalledWith(
      fx.repo,
      expect.objectContaining({ filterByCommits: true }),
    );
  });

  it("summarizeGitDiff returns the summary alongside aggregated token usage", async () => {
    const c1 = await fx.commit("root", { "a.ts": "1\n" });
    const c2 = await fx.commit("edit", { "a.ts": "2\n" });

    const { llmModelProvider } = makeUsageMockProvider([
      { text: "summary", inputTokens: 42, outputTokens: 8 },
    ]);

    const { summary, usage } = await summarizeGitDiff({
      from: c1,
      to: c2,
      git: fx.repo,
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
