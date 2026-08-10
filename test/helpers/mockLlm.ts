import { APICallError, type LanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";

export type MockDoGenerateCall = Parameters<
  MockLanguageModelV3["doGenerate"]
>[0];

const ZERO_USAGE = {
  inputTokens: {
    total: 0 as number | undefined,
    noCache: 0 as number | undefined,
    cacheRead: 0 as number | undefined,
    cacheWrite: 0 as number | undefined,
  },
  outputTokens: {
    total: 0 as number | undefined,
    text: 0 as number | undefined,
    reasoning: 0 as number | undefined,
  },
};

export function makeMockModel(text: string): {
  model: LanguageModel;
  calls: () => MockDoGenerateCall[];
} {
  const mock = new MockLanguageModelV3({
    doGenerate: async () => ({
      content: text === "" ? [] : [{ type: "text" as const, text }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: ZERO_USAGE,
      warnings: [],
    }),
  });
  return { model: mock, calls: () => mock.doGenerateCalls };
}

export function makeMockProvider(text: string): {
  llmModelProvider: () => Promise<LanguageModel>;
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
  llmModelProvider: () => Promise<LanguageModel>;
  calls: () => MockDoGenerateCall[];
} {
  const seenCalls: MockDoGenerateCall[] = [];
  let callIndex = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async (call) => {
      seenCalls.push(call);
      const text = texts[Math.min(callIndex, texts.length - 1)] ?? "";
      callIndex += 1;
      return {
        content: text === "" ? [] : [{ type: "text" as const, text }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: ZERO_USAGE,
        warnings: [],
      };
    },
  });
  return { llmModelProvider: async () => model, calls: () => seenCalls };
}

/**
 * Fails with a retryable APICallError the first `failTimes` calls, then
 * succeeds with `successText`. Useful for asserting maxRetries is actually
 * threaded through to the Vercel AI SDK's own retry behavior.
 */
export function makeFlakyMockProvider(
  failTimes: number,
  successText: string,
): {
  llmModelProvider: () => Promise<LanguageModel>;
  attemptCount: () => number;
} {
  let attempts = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      attempts += 1;
      if (attempts <= failTimes) {
        throw new APICallError({
          message: "rate limited",
          url: "https://example.test/v1/chat",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        });
      }
      return {
        content:
          successText === ""
            ? []
            : [{ type: "text" as const, text: successText }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: ZERO_USAGE,
        warnings: [],
      };
    },
  });
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
  llmModelProvider: () => Promise<LanguageModel>;
} {
  let callIndex = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      const r = responses[Math.min(callIndex, responses.length - 1)]!;
      callIndex += 1;
      const cacheRead = r.cacheReadTokens ?? 0;
      return {
        content: r.text === "" ? [] : [{ type: "text" as const, text: r.text }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: {
            total: r.inputTokens,
            noCache: r.inputTokens - cacheRead,
            cacheRead,
            cacheWrite: 0,
          },
          outputTokens: {
            total: r.outputTokens,
            text: r.outputTokens,
            reasoning: 0,
          },
        },
        warnings: [],
      };
    },
  });
  return { llmModelProvider: async () => model };
}

export function extractUserText(call: MockDoGenerateCall): string {
  const userMessage = call.prompt.find((m) => m.role === "user");
  if (!userMessage) return "";
  const content = userMessage.content;
  if (typeof content === "string") return content;
  return content
    .map((part) =>
      "text" in part && typeof part.text === "string" ? part.text : "",
    )
    .join("");
}

export function extractSystemText(call: MockDoGenerateCall): string {
  const systemMessage = call.prompt.find((m) => m.role === "system");
  if (!systemMessage) return "";
  const content = systemMessage.content;
  return typeof content === "string" ? content : "";
}
