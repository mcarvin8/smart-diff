import type { LanguageModel } from "ai";
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
