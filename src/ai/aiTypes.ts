import type { CommitInfo, DiffSummary } from "../git/index.js";
import type { ChatModel } from "./llmClient.js";
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
  /**
   * Extra instructions appended to every system prompt used for this summary:
   * the single-call prompt (default or {@link SummarizeFlags.systemPrompt}), and
   * both the map and reduce prompts under `mapReduce`. Use this to add
   * domain-specific rules without replacing the built-in prompts.
   */
  systemPromptAppend?: string;
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
 * Factory returning a `ChatModel`. Use this for tests or when you want to
 * hand-wire a provider instead of relying on env-based resolution.
 */
export type LlmModelProvider = () => Promise<ChatModel>;

/** Input object for `generateSummary` (see `aiSummary.ts`). */
export type GenerateSummaryInput = {
  diffText: string;
  fileNames: string[];
  commits: CommitInfo[];
  flags: SummarizeFlags;
  /** Returns a `ChatModel` — bypasses env-based provider resolution. */
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

/**
 * Everything needed to summarize a diff with any model, produced without an LLM
 * call by `buildSummaryContext`. Prepend `notice` (possibly empty) to the final
 * summary to match what `generateSummary` returns.
 */
export type SummaryContext =
  | {
      /** The diff fits in one request (or was truncated with an explicit marker). */
      mode: "single";
      /** Markdown to prepend to the summary: a truncation notice, or `""`. */
      notice: string;
      systemPrompt: string;
      userContent: string;
    }
  | {
      /** The diff was split into per-file batches: summarize each, then combine. */
      mode: "map-reduce";
      /** Markdown to prepend to the final summary. */
      notice: string;
      /** System prompt for each map (per-batch) call. */
      mapSystemPrompt: string;
      /** One user message per batch. */
      mapUserContents: string[];
      /** System prompt for the final reduce call. */
      reduceSystemPrompt: string;
      /**
       * Reduce-phase user content up to the batch summaries; pass it and the map
       * outputs to `buildReduceUserContent` (or append
       * `--- Batch i of n ---\n<summary>` blocks joined by blank lines).
       */
      reduceUserContentPrefix: string;
    };
