type IndexModule = typeof import("../src/index");
type CoreModule = typeof import("@actions/core");

const BOOLEAN_INPUT_DEFAULTS: Record<string, string> = {
  "merge-base": "false",
  "map-reduce": "false",
  "ignore-whitespace": "false",
  "strip-diff-preamble": "false",
  "exclude-default-noise": "false",
  "redact-secrets": "false",
};

function envKey(name: string): string {
  return `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
}

function setInputs(overrides: Record<string, string>): void {
  const merged = { ...BOOLEAN_INPUT_DEFAULTS, ...overrides };
  for (const [name, value] of Object.entries(merged)) {
    process.env[envKey(name)] = value;
  }
}

async function runAction(
  inputs: Record<string, string>,
  setup?: (freshIndexModule: IndexModule, freshCoreModule: CoreModule) => void,
): Promise<{ core: CoreModule }> {
  vi.resetModules();
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("INPUT_")) delete process.env[key];
  }
  setInputs(inputs);

  const freshIndexModule = await import("../src/index");
  const freshCoreModule = await import("@actions/core");
  vi.spyOn(freshCoreModule, "setOutput").mockImplementation(() => undefined);
  vi.spyOn(freshCoreModule, "setFailed").mockImplementation(() => undefined);
  vi.spyOn(freshCoreModule.summary, "write").mockRejectedValue(
    new Error("GITHUB_STEP_SUMMARY not set"),
  );
  setup?.(freshIndexModule, freshCoreModule);

  await import("../src/action/index");
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  return { core: freshCoreModule };
}

describe("action entrypoint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("INPUT_")) delete process.env[key];
    }
  });

  it("builds options from inputs and reports outputs on success", async () => {
    let summarizeGitDiffSpy: ReturnType<typeof vi.spyOn> | undefined;

    const { core } = await runAction(
      { from: "origin/main", to: "HEAD", include: "src\npackages/lib" },
      (mod) => {
        summarizeGitDiffSpy = vi
          .spyOn(mod, "summarizeGitDiff")
          .mockResolvedValue({
            summary: "## Summary\n\nchanges",
            usage: {
              requestCount: 2,
              inputTokens: 10,
              outputTokens: 5,
              totalTokens: 15,
              cachedInputTokens: 1,
            },
          });
      },
    );

    expect(summarizeGitDiffSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "origin/main",
        to: "HEAD",
        includeFolders: ["src", "packages/lib"],
      }),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "summary",
      "## Summary\n\nchanges",
    );
    expect(core.setOutput).toHaveBeenCalledWith("request-count", 2);
    expect(core.setOutput).toHaveBeenCalledWith("input-tokens", 10);
    expect(core.setOutput).toHaveBeenCalledWith("output-tokens", 5);
    expect(core.setOutput).toHaveBeenCalledWith("total-tokens", 15);
    expect(core.setOutput).toHaveBeenCalledWith("cached-input-tokens", 1);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("omits unset optional inputs from the built options", async () => {
    let summarizeGitDiffSpy: ReturnType<typeof vi.spyOn> | undefined;

    await runAction({ from: "main" }, (mod) => {
      summarizeGitDiffSpy = vi
        .spyOn(mod, "summarizeGitDiff")
        .mockResolvedValue({
          summary: "summary",
          usage: {
            requestCount: 1,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cachedInputTokens: 0,
          },
        });
    });

    expect(summarizeGitDiffSpy).toHaveBeenCalledWith({
      from: "main",
      to: undefined,
      mergeBase: false,
      cwd: undefined,
      includeFolders: undefined,
      excludeFolders: undefined,
      commitMessageIncludeRegexes: undefined,
      commitMessageExcludeRegexes: undefined,
      teamName: undefined,
      systemPrompt: undefined,
      provider: undefined,
      model: undefined,
      maxDiffChars: undefined,
      maxRetries: undefined,
      mapReduce: false,
      contextLines: undefined,
      ignoreWhitespace: false,
      stripDiffPreamble: false,
      maxHunkLines: undefined,
      excludeDefaultNoise: false,
      redactSecrets: false,
    });
  });

  it("fails cleanly when summarizeGitDiff rejects", async () => {
    const { core } = await runAction({ from: "main" }, (mod) => {
      vi.spyOn(mod, "summarizeGitDiff").mockRejectedValue(new Error("boom"));
    });

    expect(core.setFailed).toHaveBeenCalledWith("boom");
    expect(core.setOutput).not.toHaveBeenCalled();
  });

  it("fails cleanly when the required from input is missing", async () => {
    const { core } = await runAction({});

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("from"),
    );
  });

  it("fails cleanly on an unparsable numeric input", async () => {
    const { core } = await runAction({
      from: "main",
      "max-diff-chars": "not-a-number",
    });

    expect(core.setFailed).toHaveBeenCalledWith(
      'Invalid number for input "max-diff-chars": "not-a-number"',
    );
  });
});
