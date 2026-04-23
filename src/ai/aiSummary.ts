import { generateText } from "ai";

import type { CommitInfo, DiffSummary } from "../git/gitDiff.js";
import {
  DEFAULT_LLM_MAX_DIFF_CHARS,
  DEFAULT_GIT_DIFF_SYSTEM_PROMPT,
  LLM_GATEWAY_REQUIRED_MESSAGE,
} from "./aiConstants.js";
import type {
  GenerateSummaryInput,
  LlmModelProvider,
  SummarizeFlags,
} from "./aiTypes.js";
import {
  isLlmProviderConfigured,
  resolveLanguageModel,
} from "./llmProviders.js";

/** Resolve max unified-diff characters sent to the LLM. CLI wins, then env, then default. */
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

function markdownDiffTruncationNotice(
  originalChars: number,
  maxChars: number,
): string {
  return `> **Truncated diff:** The unified diff was ${originalChars} characters; only the first ${maxChars} were sent to the model. The summary may not reflect the full change set. Narrow the ref range, adjust path filters, or raise \`maxDiffChars\` / \`LLM_MAX_DIFF_CHARS\`—often together with switching to a model whose context window can fit a larger prompt.\n\n`;
}

function resolveMaxOutputTokens(): number {
  const raw = process.env.LLM_MAX_TOKENS ?? process.env.OPENAI_MAX_TOKENS;
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : 4000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4000;
}

export async function generateSummary(
  input: GenerateSummaryInput,
): Promise<string> {
  const {
    diffText,
    fileNames,
    commits,
    flags,
    llmModelProvider,
    diffSummary,
  } = input;

  if (!llmModelProvider && !isLlmProviderConfigured()) {
    throw new Error(LLM_GATEWAY_REQUIRED_MESSAGE);
  }

  const maxDiffChars = resolveLlmMaxDiffChars(flags.maxDiffChars);
  const diffTruncated = diffText.length > maxDiffChars;
  const diffForLlm = truncateUnifiedDiffForLlm(diffText, maxDiffChars);
  const userContent = buildUserContent(
    flags,
    commits,
    fileNames,
    diffForLlm,
    diffSummary,
  );
  const systemPrompt = flags.systemPrompt ?? DEFAULT_GIT_DIFF_SYSTEM_PROMPT;
  const maxOutputTokens = resolveMaxOutputTokens();

  const summary = await callLlm(
    userContent,
    systemPrompt,
    maxOutputTokens,
    llmModelProvider,
    flags,
  );

  if (!diffTruncated) {
    return summary;
  }
  return markdownDiffTruncationNotice(diffText.length, maxDiffChars) + summary;
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

function buildUserContent(
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

async function callLlm(
  userContent: string,
  systemPrompt: string,
  maxOutputTokens: number,
  llmModelProvider: LlmModelProvider | undefined,
  flags: SummarizeFlags,
): Promise<string> {
  const model = llmModelProvider
    ? await llmModelProvider()
    : await resolveLanguageModel({
        ...(flags.provider ? { provider: flags.provider } : {}),
        ...(flags.model ? { model: flags.model } : {}),
      });

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userContent,
    temperature: 0.2,
    maxOutputTokens,
  });

  const text = result.text.trim();
  return text.length > 0 ? text : "No summary generated by the model.";
}
