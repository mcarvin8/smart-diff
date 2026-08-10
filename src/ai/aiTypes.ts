import type { LanguageModel } from "ai";

import type { CommitInfo, DiffSummary } from "../git/gitDiff.js";
import type { LlmProviderId } from "./llmProviders.js";

export type SummarizeFlags = {
  /** Start ref for the diff. */
  from: string;
  to?: string;
  /** Model id for the resolved provider (overrides `LLM_MODEL` env and provider default). */
  model?: string;
  /** Provider id override (wins over `LLM_PROVIDER` env and auto-detection). */
  provider?: LlmProviderId;
  /** Optional team or squad label for the summary title and context. */
  team?: string;
  /** Max characters of unified diff sent to the LLM; see `resolveLlmMaxDiffChars`. */
  maxDiffChars?: number;
  /**
   * Max retry count for transient LLM call failures (rate limits, 5xx, network
   * errors); see `resolveLlmMaxRetries`. Default 2 (matches the Vercel AI SDK's
   * own default). Set to 0 to disable retries.
   */
  maxRetries?: number;
  /** When set, replaces {@link DEFAULT_GIT_DIFF_SYSTEM_PROMPT} for the chat completion. */
  systemPrompt?: string;
  commitMessageIncludeRegexes?: string[];
  commitMessageExcludeRegexes?: string[];
  /**
   * When the diff exceeds `maxDiffChars`, split it into per-file batches, summarize
   * each batch independently (map), then synthesize one final summary from the
   * batch summaries (reduce) instead of hard-truncating the diff. No effect when
   * the diff already fits within `maxDiffChars`.
   */
  mapReduce?: boolean;
};

/**
 * Factory returning a Vercel AI SDK `LanguageModel`. Use this for tests or when you
 * want to hand-wire a provider instead of relying on env-based resolution.
 */
export type LlmModelProvider = () => Promise<LanguageModel>;

/** Input object for `generateSummary` (see `aiSummary.ts`). */
export type GenerateSummaryInput = {
  diffText: string;
  fileNames: string[];
  commits: CommitInfo[];
  flags: SummarizeFlags;
  /** Returns a Vercel AI SDK `LanguageModel` — bypasses env-based provider resolution. */
  llmModelProvider?: LlmModelProvider;
  diffSummary?: DiffSummary;
};

/**
 * Token usage aggregated across every LLM call made to produce one summary —
 * a single call for the default path, or every map batch plus the reduce call
 * when `mapReduce` is used. Token counts only; no cost/dollar estimate, since
 * pricing varies by provider/model and changes over time. Fields default to 0
 * when a provider doesn't report a given figure.
 */
export type LlmUsageReport = {
  /** Number of LLM calls made for this summary (>1 only under `mapReduce`). */
  requestCount: number;
  /** Sum of input (prompt) tokens across all calls. */
  inputTokens: number;
  /** Sum of output (completion) tokens across all calls. */
  outputTokens: number;
  /** Sum of total tokens across all calls, as reported by the provider. */
  totalTokens: number;
  /** Sum of cached input tokens read across all calls (0 if unsupported/unreported). */
  cachedInputTokens: number;
};
