import type { ChatCallOptions, ChatModel, ChatResult } from "../llmClient.js";
import { postJson } from "./httpJson.js";

const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicResponse = {
  content?: { type: string; text?: string }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

export type AnthropicChatConfig = {
  modelId: string;
  apiKey?: string;
  baseURL?: string;
};

export function createAnthropicChatModel(
  config: AnthropicChatConfig,
): ChatModel {
  const baseURL = config.baseURL ?? "https://api.anthropic.com";
  return {
    async generate(call: ChatCallOptions): Promise<ChatResult> {
      const headers: Record<string, string> = {
        "anthropic-version": ANTHROPIC_VERSION,
      };
      if (config.apiKey) headers["x-api-key"] = config.apiKey;

      const body = {
        model: config.modelId,
        system: call.system,
        messages: [{ role: "user", content: call.prompt }],
        max_tokens: call.maxOutputTokens,
        temperature: call.temperature,
      };

      const data = (await postJson(
        `${baseURL.replace(/\/+$/, "")}/v1/messages`,
        body,
        headers,
        "Anthropic",
      )) as AnthropicResponse;

      const text = (data.content ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("");

      const inputTokens = data.usage?.input_tokens;
      const outputTokens = data.usage?.output_tokens;

      return {
        text,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens:
            inputTokens !== undefined && outputTokens !== undefined
              ? inputTokens + outputTokens
              : undefined,
          cachedInputTokens: data.usage?.cache_read_input_tokens,
        },
      };
    },
  };
}
