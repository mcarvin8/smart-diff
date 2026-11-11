import {
  DEFAULT_GIT_DIFF_SYSTEM_PROMPT,
  DEFAULT_MAP_REDUCE_MAP_SYSTEM_PROMPT,
  DEFAULT_MAP_REDUCE_REDUCE_SYSTEM_PROMPT,
} from "../src/ai/aiConstants";
import {
  buildReduceUserContent,
  buildSummaryContext,
  generateSummary,
} from "../src/ai/aiSummary";
import * as llmProviders from "../src/ai/llmProviders";
import type { CommitInfo } from "../src/git/index";
import { buildGitDiffSummaryContext } from "../src/index";
import {
  extractSystemText,
  extractUserText,
  makeSequentialMockProvider,
} from "./helpers/mockLlm";
import { createFixtureRepo, type FixtureRepo } from "./helpers/tsgitFixture";

const commits: CommitInfo[] = [
  { hash: "abcdef1234567", message: "feat: add thing" },
] as CommitInfo[];

function fileChunk(name: string, bodyChars: number): string {
  return `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n+${"x".repeat(bodyChars)}\n`;
}

describe("buildSummaryContext", () => {
  it("returns single mode with default prompt and no notice for a small diff", () => {
    const ctx = buildSummaryContext({
      diffText: "diff --git a/a b/a\n+1\n",
      fileNames: ["a"],
      commits,
      flags: { from: "main", to: "HEAD", team: "Core" },
    });

    expect(ctx.mode).toBe("single");
    if (ctx.mode !== "single") throw new Error("expected single");
    expect(ctx.notice).toBe("");
    expect(ctx.systemPrompt).toBe(DEFAULT_GIT_DIFF_SYSTEM_PROMPT);
    expect(ctx.userContent).toContain("Team: Core");
    expect(ctx.userContent).toContain("Git refs: main..HEAD");
    expect(ctx.userContent).toContain("- abcdef1 feat: add thing");
    expect(ctx.userContent).toContain("+1");
  });

  it("appends systemPromptAppend and honors systemPrompt override", () => {
    const ctx = buildSummaryContext({
      diffText: "d",
      fileNames: [],
      commits: [],
      flags: {
        from: "a",
        systemPrompt: "CUSTOM",
        systemPromptAppend: "  EXTRA  ",
      },
    });
    if (ctx.mode !== "single") throw new Error("expected single");
    expect(ctx.systemPrompt).toBe("CUSTOM\n\nEXTRA");
  });

  it("truncates and sets a notice when the diff is too large without mapReduce", () => {
    const ctx = buildSummaryContext({
      diffText: "y".repeat(50),
      fileNames: [],
      commits: [],
      flags: { from: "a", maxDiffChars: 10 },
    });
    if (ctx.mode !== "single") throw new Error("expected single");
    expect(ctx.notice).toContain("**Truncated diff:**");
    expect(ctx.notice).toContain("50 characters");
    expect(ctx.userContent).toContain("--- TRUNCATED");
  });

  it("returns map-reduce mode with one map message per batch", () => {
    const diffText = fileChunk("a.ts", 40) + fileChunk("b.ts", 40);
    const ctx = buildSummaryContext({
      diffText,
      fileNames: ["a.ts", "b.ts"],
      commits,
      flags: {
        from: "main",
        mapReduce: true,
        maxDiffChars: 100,
        systemPromptAppend: "RULES",
      },
    });

    expect(ctx.mode).toBe("map-reduce");
    if (ctx.mode !== "map-reduce") throw new Error("expected map-reduce");
    expect(ctx.mapUserContents).toHaveLength(2);
    expect(ctx.mapUserContents[0]).toMatch(/^=== Diff batch 1 of 2 ===\n\n/);
    expect(ctx.mapUserContents[1]).toContain("b.ts");
    expect(ctx.mapSystemPrompt).toBe(
      `${DEFAULT_MAP_REDUCE_MAP_SYSTEM_PROMPT}\n\nRULES`,
    );
    expect(ctx.reduceSystemPrompt).toBe(
      `${DEFAULT_MAP_REDUCE_REDUCE_SYSTEM_PROMPT}\n\nRULES`,
    );
    expect(ctx.notice).toContain("split into 2 batches");
    expect(ctx.reduceUserContentPrefix).toContain("- abcdef1 feat: add thing");
    expect(ctx.reduceUserContentPrefix).toMatch(
      /=== Per-batch summaries .* ===\n$/,
    );
  });

  it("does not need a configured provider", () => {
    vi.spyOn(llmProviders, "isLlmProviderConfigured").mockReturnValue(false);
    expect(() =>
      buildSummaryContext({
        diffText: "d",
        fileNames: [],
        commits: [],
        flags: { from: "a" },
      }),
    ).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe("buildReduceUserContent", () => {
  it("appends numbered batch blocks separated by blank lines", () => {
    expect(buildReduceUserContent("PREFIX\n", ["one", "two"])).toBe(
      "PREFIX\n--- Batch 1 of 2 ---\none\n\n--- Batch 2 of 2 ---\ntwo",
    );
  });
});

describe("generateSummary parity with buildSummaryContext", () => {
  it("sends exactly the context's map and reduce messages", async () => {
    const diffText = fileChunk("a.ts", 40) + fileChunk("b.ts", 40);
    const input = {
      diffText,
      fileNames: ["a.ts", "b.ts"],
      commits,
      flags: { from: "main", mapReduce: true, maxDiffChars: 100 },
    };
    const { llmModelProvider, calls: getCalls } = makeSequentialMockProvider([
      "map1",
      "map2",
      "final",
    ]);

    const summary = await generateSummary({ ...input, llmModelProvider });
    const calls = getCalls();
    const ctx = buildSummaryContext(input);
    if (ctx.mode !== "map-reduce") throw new Error("expected map-reduce");

    expect(summary).toBe(`${ctx.notice}final`);
    expect(calls).toHaveLength(3);
    expect(extractUserText(calls[0]!)).toBe(ctx.mapUserContents[0]);
    expect(extractSystemText(calls[1]!)).toBe(ctx.mapSystemPrompt);
    expect(extractSystemText(calls[2]!)).toBe(ctx.reduceSystemPrompt);
    expect(extractUserText(calls[2]!)).toContain(
      "--- Batch 1 of 2 ---\nmap1\n\n--- Batch 2 of 2 ---\nmap2",
    );
  });
});

describe("buildGitDiffSummaryContext", () => {
  let fx: FixtureRepo;

  beforeEach(async () => {
    fx = await createFixtureRepo();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fx.cleanup();
  });

  it("reads the repo and returns prompts without a provider", async () => {
    vi.spyOn(llmProviders, "isLlmProviderConfigured").mockReturnValue(false);
    const c1 = await fx.commit("root", { "a.ts": "1\n" });
    const c2 = await fx.commit("feat: edit", {
      "a.ts": "2\n",
      "secret.env": "API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789\n",
    });

    const ctx = await buildGitDiffSummaryContext({
      from: c1,
      to: c2,
      git: fx.repo,
      redactSecrets: true,
    });

    if (ctx.mode !== "single") throw new Error("expected single");
    expect(ctx.userContent).toContain("feat: edit");
    expect(ctx.userContent).toContain("a.ts");
    expect(ctx.userContent).not.toContain(
      "sk-abcdefghijklmnopqrstuvwxyz0123456789",
    );
  });
});
