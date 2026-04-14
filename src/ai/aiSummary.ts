import type { CommitInfo, DiffSummary } from "../git/gitDiff.js";
import {
  createOpenAiLikeClient,
  shouldUseLlmGateway,
  type OpenAiLikeClient,
} from "./openAIConfig.js";

/**
 * Cap on unified-diff characters sent to the LLM (only the diff body; preamble is extra).
 * Tuned for ~128k-token context models; override with `LLM_MAX_DIFF_CHARS` or `maxDiffChars` in options.
 */
const DEFAULT_LLM_MAX_DIFF_CHARS = 120_000;

/** Resolve max unified-diff characters for the LLM path. CLI wins, then env, then default. */
export function resolveLlmMaxDiffChars(cliOverride?: number): number {
  if (
    cliOverride !== undefined &&
    Number.isFinite(cliOverride) &&
    cliOverride > 0
  ) {
    return Math.trunc(cliOverride);
  }
  const raw = process.env.LLM_MAX_DIFF_CHARS?.trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_LLM_MAX_DIFF_CHARS;
}

export function truncateUnifiedDiffForLlm(
  diffText: string,
  maxChars: number,
): string {
  if (diffText.length <= maxChars) {
    return diffText;
  }
  const marker = `\n\n--- TRUNCATED: unified diff was ${diffText.length} characters; only the first ${maxChars} were sent. Narrow the ref range, adjust commit/path filters, or raise maxDiffChars / LLM_MAX_DIFF_CHARS only if your model context allows. ---\n`;
  return diffText.slice(0, maxChars) + marker;
}

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

export type SummarizeFlags = {
  /** Start ref for the diff. */
  from: string;
  to?: string;
  model?: string;
  /** Optional team or squad label for the summary title and context. */
  team?: string;
  /** Max characters of unified diff sent to the LLM; see `resolveLlmMaxDiffChars`. */
  maxDiffChars?: number;
  /** When set, replaces {@link DEFAULT_GIT_DIFF_SYSTEM_PROMPT} for the chat completion. */
  systemPrompt?: string;
  commitMessageIncludeRegexes?: string[];
  commitMessageExcludeRegexes?: string[];
};

type OpenAiClientProvider = () => Promise<OpenAiLikeClient>;

export async function generateSummary(
  diffText: string,
  fileNames: string[],
  commits: CommitInfo[],
  flags: SummarizeFlags,
  openAiClientProvider?: OpenAiClientProvider,
  diffSummary?: DiffSummary,
): Promise<string> {
  if (!shouldUseLlmGateway() && openAiClientProvider === undefined) {
    throw new Error(LLM_GATEWAY_REQUIRED_MESSAGE);
  }

  const maxDiffChars = resolveLlmMaxDiffChars(flags.maxDiffChars);
  const diffForLlm = truncateUnifiedDiffForLlm(diffText, maxDiffChars);
  const userContent = buildOpenAiUserContent(
    flags,
    commits,
    fileNames,
    diffForLlm,
    diffSummary,
  );
  return callOpenAi(
    userContent,
    flags.model ?? "gpt-4o-mini",
    flags.systemPrompt ?? DEFAULT_GIT_DIFF_SYSTEM_PROMPT,
    openAiClientProvider ??
      /* istanbul ignore next */ (async (): Promise<OpenAiLikeClient> =>
        createOpenAiLikeClient()),
  );
}

function formatRegexFilterLines(flags: SummarizeFlags): string {
  const includes = (flags.commitMessageIncludeRegexes ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const excludes = (flags.commitMessageExcludeRegexes ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

  const incLine =
    includes.length > 0
      ? `Commit message include regexes (OR): ${includes.map((r) => JSON.stringify(r)).join(", ")}\n`
      : "";
  const excLine =
    excludes.length > 0
      ? `Commit message exclude regexes: ${excludes.map((r) => JSON.stringify(r)).join(", ")}\n`
      : "";

  if (!incLine && !excLine) {
    return "Commit message filters: none.\nGit context shape: single unified diff for the full ref range.\n";
  }

  return (
    `${incLine}${excLine}` +
    "Git context shape: concatenated per-commit unified patches for commits that pass the message filters.\n"
  );
}

function buildOpenAiUserContent(
  flags: SummarizeFlags,
  commits: CommitInfo[],
  fileNames: string[],
  diffText: string,
  diffSummary?: DiffSummary,
): string {
  const from = flags.from;
  const to = flags.to ?? "HEAD";
  const team = flags.team?.trim();
  const ts = new Date().toISOString();
  const teamLine = team ? `Team: ${team}\n` : "";
  const filterBlock = formatRegexFilterLines(flags);

  const commitBlock =
    commits.length > 0
      ? commits
          .map(
            (c) =>
              `- ${c.hash.slice(0, 7)} ${c.message.replace(/\r?\n/g, " ")}`,
          )
          .join("\n")
      : "- (no commits in range after filtering)";

  const pathsBlock =
    fileNames.length > 0 ? fileNames.join("\n") : "(no paths in diff scope)";
  const structuredDiffSection = diffSummary
    ? `=== Structured git context (JSON summary) ===\n${JSON.stringify(diffSummary, null, 2)}\n\n`
    : "";

  return (
    `${teamLine}` +
    `Date: ${ts}\n\n` +
    `Git refs: ${from}..${to}\n` +
    filterBlock +
    "\n" +
    "=== Included commits (subject lines) ===\n" +
    `${commitBlock}\n\n` +
    "=== Changed paths ===\n" +
    `${pathsBlock}\n\n` +
    structuredDiffSection +
    "=== Git context (unified diff(s); patches may be truncated with an explicit marker) ===\n" +
    diffText
  );
}

async function callOpenAi(
  userContent: string,
  model: string,
  systemPrompt: string,
  openAiClientProvider: OpenAiClientProvider,
): Promise<string> {
  const client = await openAiClientProvider();
  const maxTokensRaw =
    process.env.LLM_MAX_TOKENS ?? process.env.OPENAI_MAX_TOKENS;
  const parsed =
    maxTokensRaw !== undefined ? Number.parseInt(maxTokensRaw, 10) : 4000;
  const maxTokens = Number.isFinite(parsed) && parsed > 0 ? parsed : 4000;

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    temperature: 0.2,
    // OpenAI Chat Completions API uses snake_case for this field.
    // eslint-disable-next-line camelcase -- matches OpenAI request body
    max_tokens: maxTokens,
  });

  const typedResponse = response as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = typedResponse.choices?.[0]?.message?.content?.trim() ?? "";
  return text.length > 0 ? text : "No summary generated by OpenAI.";
}
