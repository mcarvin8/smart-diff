import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type IndexModule = typeof import("../src/index");

async function runCli(
  argv: string[],
  setup?: (freshIndexModule: IndexModule) => void,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}> {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  process.argv = ["node", "cli.js", ...argv];
  process.exitCode = undefined;

  let stdout = "";
  let stderr = "";
  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown) => {
      stderr += String(chunk);
      return true;
    });

  // Reset the module registry so cli.ts's top-level `main().catch(...)`
  // re-runs per test, then re-import index.ts fresh and let the caller spy
  // on it *before* importing cli.ts, so cli.ts's own import of index.ts
  // resolves to that same (now-spied) instance.
  vi.resetModules();
  const freshIndexModule = await import("../src/index");
  setup?.(freshIndexModule);
  await import("../src/cli");
  // main() is fire-and-forget (`main().catch(...)`); flush the microtask
  // queue a few times so its awaited calls settle before we assert.
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  const exitCode = process.exitCode;

  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  process.argv = originalArgv;
  process.exitCode = originalExitCode;

  return { stdout, stderr, exitCode };
}

describe("cli entrypoint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints help text and does not set an exit code for --help", async () => {
    const { stdout, exitCode } = await runCli(["--help"]);
    expect(stdout).toContain("smart-diff <from> [to] [options]");
    expect(exitCode).toBeUndefined();
  });

  it("prints the package version for --version", async () => {
    const { stdout, exitCode } = await runCli(["--version"]);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(exitCode).toBeUndefined();
  });

  it("prints a usage error and exits 1 when <from> is missing", async () => {
    const { stderr, exitCode } = await runCli([]);
    expect(stderr).toContain("Missing required <from> ref");
    expect(exitCode).toBe(1);
  });

  it("summarizes and prints markdown to stdout on success", async () => {
    let summarizeGitDiffSpy: ReturnType<typeof vi.spyOn> | undefined;

    const { stdout, exitCode } = await runCli(
      ["origin/main", "HEAD"],
      (mod) => {
        summarizeGitDiffSpy = vi
          .spyOn(mod, "summarizeGitDiff")
          .mockResolvedValue({
            summary: "## Summary\n\nchanges",
            usage: {
              requestCount: 1,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              cachedInputTokens: 0,
            },
          });
      },
    );

    expect(summarizeGitDiffSpy).toHaveBeenCalledWith(
      expect.objectContaining({ from: "origin/main", to: "HEAD" }),
    );
    expect(stdout).toContain("## Summary");
    expect(exitCode).toBeUndefined();
  });

  it("reports usage on stderr when --usage is set", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      ["origin/main", "--usage"],
      (mod) => {
        vi.spyOn(mod, "summarizeGitDiff").mockResolvedValue({
          summary: "## Summary",
          usage: {
            requestCount: 1,
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
            cachedInputTokens: 0,
          },
        });
      },
    );

    expect(stdout).toContain("## Summary");
    expect(stderr).toContain("[usage]");
    expect(stderr).toContain('"inputTokens":10');
    expect(exitCode).toBeUndefined();
  });

  it("reads --prompt-file contents into systemPromptAppend", async () => {
    const dir = mkdtempSync(join(tmpdir(), "smart-diff-cli-"));
    try {
      const file = join(dir, "rules.md");
      writeFileSync(file, "  Salesforce rules.  \n");
      let summarizeGitDiffSpy: ReturnType<typeof vi.spyOn> | undefined;

      const { exitCode } = await runCli(
        ["origin/main", "--prompt-file", file],
        (mod) => {
          summarizeGitDiffSpy = vi
            .spyOn(mod, "summarizeGitDiff")
            .mockResolvedValue({
              summary: "## Summary",
              usage: {
                requestCount: 1,
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                cachedInputTokens: 0,
              },
            });
        },
      );

      expect(summarizeGitDiffSpy).toHaveBeenCalledWith(
        expect.objectContaining({ systemPromptAppend: "Salesforce rules." }),
      );
      expect(exitCode).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not set systemPromptAppend when no --prompt-file is given", async () => {
    let summarizeGitDiffSpy: ReturnType<typeof vi.spyOn> | undefined;

    await runCli(["origin/main"], (mod) => {
      summarizeGitDiffSpy = vi
        .spyOn(mod, "summarizeGitDiff")
        .mockResolvedValue({
          summary: "## Summary",
          usage: {
            requestCount: 1,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cachedInputTokens: 0,
          },
        });
    });

    const passed = summarizeGitDiffSpy!.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect("systemPromptAppend" in passed).toBe(false);
  });

  it("exits 1 with the path when a --prompt-file cannot be read", async () => {
    const { stderr, exitCode } = await runCli([
      "origin/main",
      "--prompt-file",
      "does-not-exist.md",
    ]);

    expect(stderr).toContain('Cannot read prompt file "does-not-exist.md"');
    expect(exitCode).toBe(1);
  });

  it("prints a clean one-line error and exits 1 when summarization rejects", async () => {
    const { stderr, exitCode } = await runCli(["origin/main"], (mod) => {
      vi.spyOn(mod, "summarizeGitDiff").mockRejectedValue(new Error("boom"));
    });

    expect(stderr).toBe("Error: boom\n");
    expect(exitCode).toBe(1);
  });
});
