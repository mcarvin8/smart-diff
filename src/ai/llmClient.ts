/**
 * In-house replacement for the Vercel AI SDK's `generateText` + `LanguageModel`.
 * smart-diff only ever needs one capability from an LLM provider — "send a
 * system+user prompt, get text and token usage back" — so this defines that
 * narrow contract directly instead of depending on `ai` and the `@ai-sdk/*`
 * provider packages (each of which pulls in its own HTTP client, schema
 * validation, and streaming machinery smart-diff never uses).
 */

export type ChatCallOptions = {
  system: string;
  prompt: string;
  temperature: number;
  maxOutputTokens: number;
};

export type ChatUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
};

export type ChatResult = {
  text: string;
  usage: ChatUsage;
};

/** The only capability smart-diff needs from a resolved LLM provider/model. */
export interface ChatModel {
  generate(options: ChatCallOptions): Promise<ChatResult>;
}

/** True for HTTP statuses worth retrying: 429 (rate limit) and 5xx (server error). */
export function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 429 || statusCode >= 500;
}

/** Thrown by in-house provider clients; `retryable` drives `generateText`'s retry loop. */
export class LlmApiError extends Error {
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { statusCode?: number; retryable: boolean; cause?: unknown },
  ) {
    super(message);
    this.name = "LlmApiError";
    this.statusCode = options.statusCode;
    this.retryable = options.retryable;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** (attempt - 1), 8000);
}

export type GenerateTextOptions = ChatCallOptions & {
  model: ChatModel;
  maxRetries: number;
};

/**
 * Calls `model.generate`, retrying retryable `LlmApiError`s up to `maxRetries`
 * times with exponential backoff (matches the shape of the Vercel AI SDK's own
 * `generateText`, minus the parts smart-diff never used: streaming, tool
 * calls, structured output).
 */
export async function generateText(
  options: GenerateTextOptions,
): Promise<ChatResult> {
  const { model, maxRetries, ...call } = options;
  let attempt = 0;
  for (;;) {
    try {
      return await model.generate(call);
    } catch (error) {
      const retryable = error instanceof LlmApiError && error.retryable;
      if (!retryable || attempt >= maxRetries) throw error;
      attempt += 1;
      await sleep(backoffMs(attempt));
    }
  }
}
