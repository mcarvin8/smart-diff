/**
 * Cap on unified-diff characters sent to the LLM (only the diff body; preamble is extra).
 * Tuned for ~128k-token context models; override with `LLM_MAX_DIFF_CHARS` or `maxDiffChars` in options.
 */
export const DEFAULT_LLM_MAX_DIFF_CHARS = 120_000;

/**
 * Default retry count for transient LLM call failures (rate limits, 5xx, network
 * errors). Matches the Vercel AI SDK's own `generateText` default; override with
 * `LLM_MAX_RETRIES` or `maxRetries` in options. Set to 0 to disable retries.
 */
export const DEFAULT_LLM_MAX_RETRIES = 2;

/** Default system prompt when summarizing a git diff for any repository. */
export const DEFAULT_GIT_DIFF_SYSTEM_PROMPT = `You are a senior software engineer helping developers understand code and configuration changes from the git context they supplied.
You receive: commit subject lines (when available), changed file paths, and unified git patch(es)—either one range diff or concatenated per-commit patches, depending on how the diff was produced. Patches may be truncated mid-section with an explicit marker—do not infer changes beyond visible lines.
Explain what changed in terms of behavior, APIs, data, configuration, security, and operational risk. Tie claims to the patch when possible.
Produce a concise, developer-focused summary in Markdown.
Use sections that fit the change (for example: Highlights, Breaking or risky changes, API / contract changes, Data & schema, Configuration & infra, Security & auth, Tests & quality). Omit empty sections.
Group related changes; do not list every individual file. When multiple commits appear in the context, briefly separate notable themes by commit when helpful.
If the user message includes a Team line, use that exact team name in the summary title (for example: "## <Team> – Change summary" or similar).`;

/**
 * System prompt for the "map" phase of map-reduce summarization: a concise,
 * factual summary of one batch of files, meant to be combined with other
 * batches' summaries rather than read on its own.
 */
export const DEFAULT_MAP_REDUCE_MAP_SYSTEM_PROMPT = `You are a senior software engineer analyzing one batch of a larger git diff that was split into batches because it exceeded the size sendable in a single request.
You receive unified diff patch(es) for a subset of the changed files. Summarize what changed in THIS batch only, in concise bullet points: behavior, APIs, data, configuration, security, and operational risk. Tie claims to the visible patch content; do not speculate about files not shown here.
Keep it terse and factual—no headers, no greetings, no restating these instructions. This output will be merged with other batches' summaries into one final report.`;

/**
 * System prompt for the "reduce" phase of map-reduce summarization: synthesizes
 * the per-batch summaries (not raw diff text) into one cohesive report.
 */
export const DEFAULT_MAP_REDUCE_REDUCE_SYSTEM_PROMPT = `You are a senior software engineer producing a final change summary for developers.
Because the underlying git diff was too large for a single request, it was split into batches and summarized independently. You now receive: commit subject lines (when available), changed file paths, an optional structured JSON diff summary, and per-batch bullet-point summaries covering disjoint subsets of the changed files.
Synthesize one cohesive, developer-focused Markdown summary. Merge related points across batches and remove duplication—do not simply concatenate the batch summaries.
Explain what changed in terms of behavior, APIs, data, configuration, security, and operational risk.
Use sections that fit the change (for example: Highlights, Breaking or risky changes, API / contract changes, Data & schema, Configuration & infra, Security & auth, Tests & quality). Omit empty sections.
Group related changes; do not list every individual file.
If the user message includes a Team line, use that exact team name in the summary title (for example: "## <Team> – Change summary" or similar).`;

/** Thrown when no LLM provider is configured and no injection point was passed. */
export const LLM_GATEWAY_REQUIRED_MESSAGE =
  "No LLM provider configured. Set LLM_PROVIDER (openai | openai-compatible | anthropic | google | bedrock | mistral | cohere | groq | xai | deepseek), " +
  "or a provider API key (OPENAI_API_KEY, LLM_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, MISTRAL_API_KEY, COHERE_API_KEY, GROQ_API_KEY, XAI_API_KEY, DEEPSEEK_API_KEY), " +
  "or LLM_BASE_URL / OPENAI_BASE_URL for an OpenAI-compatible gateway, " +
  "or JSON in OPENAI_DEFAULT_HEADERS / LLM_DEFAULT_HEADERS. " +
  "Alternatively pass llmModelProvider to generateSummary or summarizeGitDiff.";
