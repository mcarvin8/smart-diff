import type { CommitInfo, DiffSummary } from "../git/gitDiff.js";
import { type OpenAiLikeClient } from "./openAIConfig.js";

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

export type OpenAiClientProvider = () => Promise<OpenAiLikeClient>;

/** Input object for `generateSummary` (see `aiSummary.ts`). */
export type GenerateSummaryInput = {
  diffText: string;
  fileNames: string[];
  commits: CommitInfo[];
  flags: SummarizeFlags;
  openAiClientProvider?: OpenAiClientProvider;
  diffSummary?: DiffSummary;
};
