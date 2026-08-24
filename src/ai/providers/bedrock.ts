import {
  type ChatCallOptions,
  type ChatModel,
  type ChatResult,
  isRetryableStatus,
  LlmApiError,
} from "../llmClient.js";
import { type SigV4Credentials, signRequest } from "./sigv4.js";

/**
 * Uses Bedrock's Converse API (`/model/{id}/converse`), which normalizes
 * request/response shape across every model family Bedrock hosts (Anthropic,
 * Titan, Llama, Mistral, Cohere, etc.) — one implementation instead of one
 * per underlying model provider.
 */

type ConverseResponse = {
  output?: { message?: { content?: { text?: string }[] } };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadInputTokens?: number;
  };
};

export type BedrockChatConfig = {
  modelId: string;
  region: string;
  /** Resolved lazily, at call time, so constructing the model never requires credentials. */
  getCredentials: () => SigV4Credentials | undefined;
};

export function createBedrockChatModel(config: BedrockChatConfig): ChatModel {
  return {
    async generate(call: ChatCallOptions): Promise<ChatResult> {
      const credentials = config.getCredentials();
      if (!credentials) {
        throw new Error(
          "bedrock provider requires AWS credentials: set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY " +
            "(optionally AWS_SESSION_TOKEN), or AWS_PROFILE pointing at a profile in ~/.aws/credentials.",
        );
      }

      const url = new URL(
        `https://bedrock-runtime.${config.region}.amazonaws.com/model/${encodeURIComponent(config.modelId)}/converse`,
      );
      const body = JSON.stringify({
        system: [{ text: call.system }],
        messages: [{ role: "user", content: [{ text: call.prompt }] }],
        inferenceConfig: {
          maxTokens: call.maxOutputTokens,
          temperature: call.temperature,
        },
      });

      const headers = signRequest({
        method: "POST",
        url,
        headers: { "content-type": "application/json" },
        body,
        region: config.region,
        service: "bedrock",
        credentials,
      });

      let response: Response;
      try {
        response = await fetch(url, { method: "POST", headers, body });
      } catch (cause) {
        throw new LlmApiError("Bedrock request failed: network error.", {
          retryable: true,
          cause,
        });
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new LlmApiError(
          `Bedrock request failed with status ${response.status}: ${text.slice(0, 500)}`,
          {
            statusCode: response.status,
            retryable: isRetryableStatus(response.status),
          },
        );
      }

      const data = (await response.json()) as ConverseResponse;
      const text = (data.output?.message?.content ?? [])
        .map((part) => part.text ?? "")
        .join("");

      return {
        text,
        usage: {
          inputTokens: data.usage?.inputTokens,
          outputTokens: data.usage?.outputTokens,
          totalTokens: data.usage?.totalTokens,
          cachedInputTokens: data.usage?.cacheReadInputTokens,
        },
      };
    },
  };
}
