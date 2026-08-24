import type { ChatCallOptions, ChatModel, ChatResult } from "../llmClient.js";
import { postJson } from "./httpJson.js";

type GoogleResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
  };
};

export type GoogleChatConfig = {
  modelId: string;
  apiKey?: string;
};

export function createGoogleChatModel(config: GoogleChatConfig): ChatModel {
  return {
    async generate(call: ChatCallOptions): Promise<ChatResult> {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.modelId)}:generateContent`;
      const headers: Record<string, string> = {};
      if (config.apiKey) headers["x-goog-api-key"] = config.apiKey;

      const body = {
        systemInstruction: { parts: [{ text: call.system }] },
        contents: [{ role: "user", parts: [{ text: call.prompt }] }],
        generationConfig: {
          temperature: call.temperature,
          maxOutputTokens: call.maxOutputTokens,
        },
      };

      const data = (await postJson(
        url,
        body,
        headers,
        "Google",
      )) as GoogleResponse;

      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? "")
          .join("") ?? "";

      return {
        text,
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount,
          outputTokens: data.usageMetadata?.candidatesTokenCount,
          totalTokens: data.usageMetadata?.totalTokenCount,
          cachedInputTokens: data.usageMetadata?.cachedContentTokenCount,
        },
      };
    },
  };
}
