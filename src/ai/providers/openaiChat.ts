import type { ChatCallOptions, ChatModel, ChatResult } from "../llmClient.js";
import { postJson } from "./httpJson.js";

/**
 * Chat model for any provider exposing an OpenAI-compatible
 * `POST {baseURL}/chat/completions` endpoint: OpenAI itself, `openai-compatible`
 * gateways, Groq, xAI, DeepSeek, and Mistral (whose native API mirrors this shape).
 */
export type OpenAiChatConfig = {
  baseURL: string;
  modelId: string;
  apiKey?: string;
  headers?: Record<string, string>;
  /** Provider label used in error messages, e.g. "OpenAI", "Groq". */
  label: string;
};

type OpenAiChatResponse = {
  choices?: { message?: { content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
};

export function createOpenAiChatModel(config: OpenAiChatConfig): ChatModel {
  return {
    async generate(options: ChatCallOptions): Promise<ChatResult> {
      const headers: Record<string, string> = { ...config.headers };
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

      const url = `${config.baseURL.replace(/\/+$/, "")}/chat/completions`;
      const body = {
        model: config.modelId,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.prompt },
        ],
        temperature: options.temperature,
        max_tokens: options.maxOutputTokens,
      };

      const data = (await postJson(
        url,
        body,
        headers,
        config.label,
      )) as OpenAiChatResponse;
      const text = data.choices?.[0]?.message?.content ?? "";
      const usage = data.usage;

      return {
        text,
        usage: {
          inputTokens: usage?.prompt_tokens,
          outputTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
          cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens,
        },
      };
    },
  };
}
