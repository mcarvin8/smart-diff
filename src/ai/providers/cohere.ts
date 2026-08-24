import type { ChatCallOptions, ChatModel, ChatResult } from "../llmClient.js";
import { postJson } from "./httpJson.js";

type CohereResponse = {
  message?: { content?: { type: string; text?: string }[] };
  usage?: {
    tokens?: { input_tokens?: number; output_tokens?: number };
    billed_units?: { input_tokens?: number; output_tokens?: number };
  };
};

export type CohereChatConfig = {
  modelId: string;
  apiKey?: string;
};

export function createCohereChatModel(config: CohereChatConfig): ChatModel {
  return {
    async generate(call: ChatCallOptions): Promise<ChatResult> {
      const headers: Record<string, string> = {};
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

      const body = {
        model: config.modelId,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.prompt },
        ],
        temperature: call.temperature,
        max_tokens: call.maxOutputTokens,
      };

      const data = (await postJson(
        "https://api.cohere.com/v2/chat",
        body,
        headers,
        "Cohere",
      )) as CohereResponse;

      const text = (data.message?.content ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("");

      const inputTokens =
        data.usage?.tokens?.input_tokens ??
        data.usage?.billed_units?.input_tokens;
      const outputTokens =
        data.usage?.tokens?.output_tokens ??
        data.usage?.billed_units?.output_tokens;

      return {
        text,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens:
            inputTokens !== undefined && outputTokens !== undefined
              ? inputTokens + outputTokens
              : undefined,
        },
      };
    },
  };
}
