/**
 * Cap on unified-diff characters sent to the LLM (only the diff body; preamble is extra).
 * Tuned for ~128k-token context models; override with `LLM_MAX_DIFF_CHARS` or `maxDiffChars` in options.
 */
export const DEFAULT_LLM_MAX_DIFF_CHARS = 120_000;

/** Default system prompt when summarizing a git diff for any repository. */
export const DEFAULT_GIT_DIFF_SYSTEM_PROMPT = `You are a senior software engineer helping developers understand code and configuration changes from the git context they supplied.
You receive: commit subject lines (when available), changed file paths, and unified git patch(es)—either one range diff or concatenated per-commit patches, depending on how the diff was produced. Patches may be truncated mid-section with an explicit marker—do not infer changes beyond visible lines.
Explain what changed in terms of behavior, APIs, data, configuration, security, and operational risk. Tie claims to the patch when possible.
Produce a concise, developer-focused summary in Markdown.
Use sections that fit the change (for example: Highlights, Breaking or risky changes, API / contract changes, Data & schema, Configuration & infra, Security & auth, Tests & quality). Omit empty sections.
Group related changes; do not list every individual file. When multiple commits appear in the context, briefly separate notable themes by commit when helpful.
If the user message includes a Team line, use that exact team name in the summary title (for example: "## <Team> – Change summary" or similar).`;

/** Thrown when no LLM gateway is configured and no `openAiClientProvider` was passed. */
export const LLM_GATEWAY_REQUIRED_MESSAGE =
  "No LLM gateway configured. Set OPENAI_API_KEY or LLM_API_KEY, and/or LLM_BASE_URL or OPENAI_BASE_URL, " +
  "and/or JSON in OPENAI_DEFAULT_HEADERS or LLM_DEFAULT_HEADERS. " +
  "Alternatively pass openAiClientProvider to generateSummary or summarizeGitDiff.";
