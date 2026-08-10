import { generateText, type LanguageModelUsage } from "ai";

import type { CommitInfo, DiffSummary } from "../git/index.js";
import {
  DEFAULT_GIT_DIFF_SYSTEM_PROMPT,
  DEFAULT_LLM_MAX_DIFF_CHARS,
  DEFAULT_LLM_MAX_RETRIES,
  DEFAULT_MAP_REDUCE_MAP_SYSTEM_PROMPT,
  DEFAULT_MAP_REDUCE_REDUCE_SYSTEM_PROMPT,
  LLM_GATEWAY_REQUIRED_MESSAGE,
} from "./aiConstants.js";
import type {
  GenerateSummaryInput,
  LlmModelProvider,
  LlmUsageReport,
  SummarizeFlags,
} from "./aiTypes.js";
import {
  groupDiffChunksByBudget,
  splitUnifiedDiffIntoFileChunks,
} from "./diffChunking.js";
import {
  isLlmProviderConfigured,
  resolveLanguageModel,
} from "./llmProviders.js";

/** Resolve max unified-diff characters sent to the LLM. CLI wins, then env, then default. */
export function resolveLlmMaxDiffChars(cliOverride?: number): number {
  if (
    // Stryker disable next-line ConditionalExpression
    cliOverride !== undefined &&
    Number.isFinite(cliOverride) &&
    cliOverride > 0
  ) {
    return Math.trunc(cliOverride);
  }
  const raw =
    process.env.LLM_MAX_DIFF_CHARS?.trim() ||
    // Stryker disable next-line MethodExpression
    process.env.OPENAI_MAX_DIFF_CHARS?.trim();
  // Stryker disable next-line ConditionalExpression
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_LLM_MAX_DIFF_CHARS;
}

/** Resolve max retry count for transient LLM call failures. CLI wins, then env, then default. */
export function resolveLlmMaxRetries(cliOverride?: number): number {
  if (
    // Stryker disable next-line ConditionalExpression
    cliOverride !== undefined &&
    Number.isFinite(cliOverride) &&
    cliOverride >= 0
  ) {
    return Math.trunc(cliOverride);
  }
  const raw = process.env.LLM_MAX_RETRIES?.trim();
  // Stryker disable next-line ConditionalExpression
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return DEFAULT_LLM_MAX_RETRIES;
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

function markdownMapReduceNotice(batchCount: number): string {
  return `> **Map-reduce summary:** The unified diff exceeded the configured size limit and was split into ${batchCount} batch${batchCount === 1 ? "" : "es"}, summarized independently, then combined into the report below.\n\n`;
}

function resolveMaxOutputTokens(): number {
  const raw = process.env.LLM_MAX_TOKENS ?? process.env.OPENAI_MAX_TOKENS;
  // Stryker disable next-line ConditionalExpression
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : 4000;
  // Stryker disable next-line LogicalOperator
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4000;
}

function resolveLlmTemperature(): number {
  // Stryker disable next-line MethodExpression
  const raw = process.env.LLM_TEMPERATURE?.trim();
  // Stryker disable next-line ConditionalExpression
  if (raw) {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return Math.min(2, Math.max(0, parsed));
    }
  }
  return 0.2;
}

function emptyUsageReport(): LlmUsageReport {
  return {
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
  };
}

function addUsage(
  report: LlmUsageReport,
  usage: LanguageModelUsage | undefined,
): void {
  report.requestCount += 1;
  report.inputTokens += usage?.inputTokens ?? 0;
  report.outputTokens += usage?.outputTokens ?? 0;
  report.totalTokens += usage?.totalTokens ?? 0;
  report.cachedInputTokens += usage?.inputTokenDetails?.cacheReadTokens ?? 0;
}

export async function generateSummary(
  input: GenerateSummaryInput,
): Promise<string> {
  const { summary } = await generateSummaryWithUsage(input);
  return summary;
}

/**
 * Same as `generateSummary`, but also returns token usage aggregated across
 * every LLM call made to produce the summary (one call, or every map-reduce
 * batch plus the reduce call). See {@link LlmUsageReport}.
 */
export async function generateSummaryWithUsage(
  input: GenerateSummaryInput,
): Promise<{ summary: string; usage: LlmUsageReport }> {
  const { diffText, fileNames, commits, flags, llmModelProvider, diffSummary } =
    input;

  if (!llmModelProvider && !isLlmProviderConfigured()) {
    throw new Error(LLM_GATEWAY_REQUIRED_MESSAGE);
  }

  const maxDiffChars = resolveLlmMaxDiffChars(flags.maxDiffChars);
  const diffTruncated = diffText.length > maxDiffChars;
  const maxOutputTokens = resolveMaxOutputTokens();
  const maxRetries = resolveLlmMaxRetries(flags.maxRetries);
  const usage = emptyUsageReport();

  if (flags.mapReduce && diffTruncated) {
    const summary = await generateSummaryMapReduce(
      diffText,
      fileNames,
      commits,
      flags,
      diffSummary,
      maxDiffChars,
      maxOutputTokens,
      maxRetries,
      llmModelProvider,
      usage,
    );
    return { summary, usage };
  }

  const diffForLlm = truncateUnifiedDiffForLlm(diffText, maxDiffChars);
  const userContent = buildUserContent(
    flags,
    commits,
    fileNames,
    diffForLlm,
    diffSummary,
  );
  const systemPrompt = flags.systemPrompt ?? DEFAULT_GIT_DIFF_SYSTEM_PROMPT;

  const summaryText = await callLlm(
    userContent,
    systemPrompt,
    maxOutputTokens,
    maxRetries,
    llmModelProvider,
    flags,
    usage,
  );

  const summary = diffTruncated
    ? markdownDiffTruncationNotice(diffText.length, maxDiffChars) + summaryText
    : summaryText;

  return { summary, usage };
}

async function generateSummaryMapReduce(
  diffText: string,
  fileNames: string[],
  commits: CommitInfo[],
  flags: SummarizeFlags,
  diffSummary: DiffSummary | undefined,
  maxDiffChars: number,
  maxOutputTokens: number,
  maxRetries: number,
  llmModelProvider: LlmModelProvider | undefined,
  usage: LlmUsageReport,
): Promise<string> {
  const chunks = splitUnifiedDiffIntoFileChunks(diffText);
  const batches = groupDiffChunksByBudget(chunks, maxDiffChars);

  const batchSummaries: string[] = [];
  for (const [i, batch] of batches.entries()) {
    const batchForLlm = truncateUnifiedDiffForLlm(batch, maxDiffChars);
    const mapUserContent = `=== Diff batch ${i + 1} of ${batches.length} ===\n\n${batchForLlm}`;
    batchSummaries.push(
      await callLlm(
        mapUserContent,
        DEFAULT_MAP_REDUCE_MAP_SYSTEM_PROMPT,
        maxOutputTokens,
        maxRetries,
        llmModelProvider,
        flags,
        usage,
      ),
    );
  }

  const reduceSystemPrompt =
    flags.systemPrompt ?? DEFAULT_MAP_REDUCE_REDUCE_SYSTEM_PROMPT;
  const reduceUserContent = buildReduceUserContent(
    flags,
    commits,
    fileNames,
    diffSummary,
    batchSummaries,
  );

  const finalSummary = await callLlm(
    reduceUserContent,
    reduceSystemPrompt,
    maxOutputTokens,
    maxRetries,
    llmModelProvider,
    flags,
    usage,
  );

  return markdownMapReduceNotice(batches.length) + finalSummary;
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

function buildContextHeader(
  flags: SummarizeFlags,
  commits: CommitInfo[],
  fileNames: string[],
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
    structuredDiffSection
  );
}

function buildUserContent(
  flags: SummarizeFlags,
  commits: CommitInfo[],
  fileNames: string[],
  diffText: string,
  diffSummary?: DiffSummary,
): string {
  return (
    buildContextHeader(flags, commits, fileNames, diffSummary) +
    "=== Git context (unified diff(s); patches may be truncated with an explicit marker) ===\n" +
    diffText
  );
}

function buildReduceUserContent(
  flags: SummarizeFlags,
  commits: CommitInfo[],
  fileNames: string[],
  diffSummary: DiffSummary | undefined,
  batchSummaries: string[],
): string {
  const batchesBlock = batchSummaries
    .map((s, i) => `--- Batch ${i + 1} of ${batchSummaries.length} ---\n${s}`)
    .join("\n\n");

  return (
    buildContextHeader(flags, commits, fileNames, diffSummary) +
    "=== Per-batch summaries (synthesize into one cohesive report; do not just concatenate) ===\n" +
    batchesBlock
  );
}

async function callLlm(
  userContent: string,
  systemPrompt: string,
  maxOutputTokens: number,
  maxRetries: number,
  llmModelProvider: LlmModelProvider | undefined,
  flags: SummarizeFlags,
  usage: LlmUsageReport,
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
    temperature: resolveLlmTemperature(),
    maxOutputTokens,
    maxRetries,
  });
  addUsage(usage, result.usage);

  const text = result.text.trim();
  return text.length > 0 ? text : "No summary generated by the model.";
}
