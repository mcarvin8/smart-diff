import {
  type ChatCallOptions,
  type ChatModel,
  type ChatResult,
  LlmApiError,
} from "../../src/ai/llmClient";

export type MockDoGenerateCall = ChatCallOptions;

function toResult(text: string): ChatResult {
  return { text, usage: {} };
}

export function makeMockModel(text: string): {
  model: ChatModel;
  calls: () => MockDoGenerateCall[];
} {
  const calls: MockDoGenerateCall[] = [];
  const model: ChatModel = {
    async generate(call) {
      calls.push(call);
      return toResult(text);
    },
  };
  return { model, calls: () => calls };
}

export function makeMockProvider(text: string): {
  llmModelProvider: () => Promise<ChatModel>;
  calls: () => MockDoGenerateCall[];
} {
  const { model, calls } = makeMockModel(text);
  return { llmModelProvider: async () => model, calls };
}

/**
 * Returns a distinct response per call, in order (the last entry repeats for
 * any calls beyond the list length). Useful for asserting map-reduce behavior,
 * where the map calls and the final reduce call need to return different text.
 */
export function makeSequentialMockProvider(texts: string[]): {
  llmModelProvider: () => Promise<ChatModel>;
  calls: () => MockDoGenerateCall[];
} {
  const seenCalls: MockDoGenerateCall[] = [];
  let callIndex = 0;
  const model: ChatModel = {
    async generate(call) {
      seenCalls.push(call);
      const text = texts[Math.min(callIndex, texts.length - 1)] ?? "";
      callIndex += 1;
      return toResult(text);
    },
  };
  return { llmModelProvider: async () => model, calls: () => seenCalls };
}

/**
 * Fails with a retryable `LlmApiError` the first `failTimes` calls, then
 * succeeds with `successText`. Useful for asserting maxRetries is actually
 * threaded through to `generateText`'s own retry behavior.
 */
export function makeFlakyMockProvider(
  failTimes: number,
  successText: string,
): {
  llmModelProvider: () => Promise<ChatModel>;
  attemptCount: () => number;
} {
  let attempts = 0;
  const model: ChatModel = {
    async generate() {
      attempts += 1;
      if (attempts <= failTimes) {
        throw new LlmApiError("rate limited", {
          statusCode: 429,
          retryable: true,
        });
      }
      return toResult(successText);
    },
  };
  return { llmModelProvider: async () => model, attemptCount: () => attempts };
}

export type MockUsageResponse = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
};

/**
 * Returns one response per call (in order, repeating the last entry beyond
 * the list length), each reporting the given token usage. Useful for
 * asserting that usage is aggregated correctly across multiple LLM calls
 * (e.g. map-reduce batches).
 */
export function makeUsageMockProvider(responses: MockUsageResponse[]): {
  llmModelProvider: () => Promise<ChatModel>;
} {
  let callIndex = 0;
  const model: ChatModel = {
    async generate() {
      const r = responses[Math.min(callIndex, responses.length - 1)]!;
      callIndex += 1;
      return {
        text: r.text,
        usage: {
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          totalTokens: r.inputTokens + r.outputTokens,
          cachedInputTokens: r.cacheReadTokens ?? 0,
        },
      };
    },
  };
  return { llmModelProvider: async () => model };
}

export function extractUserText(call: MockDoGenerateCall): string {
  return call.prompt;
}

export function extractSystemText(call: MockDoGenerateCall): string {
  return call.system;
}
