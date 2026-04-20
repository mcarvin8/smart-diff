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
  /** When set, replaces {@link DEFAULT_GIT_DIFF_SYSTEM_PROMPT} for the chat completion. */
  systemPrompt?: string;
  commitMessageIncludeRegexes?: string[];
  commitMessageExcludeRegexes?: string[];
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
