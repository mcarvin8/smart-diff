/**
 * Resolves an in-house `ChatModel` (see `llmClient.ts`) for the configured
 * provider. Every provider talks to its API directly over `fetch` — no
 * provider SDKs, no dynamic imports, no optional dependencies.
 *
 * Providers:
 *   - `openai`             — OpenAI Chat Completions API (default when only OpenAI creds are set)
 *   - `openai-compatible`  — OpenAI-compatible Chat Completions API (default when `LLM_BASE_URL`/`OPENAI_BASE_URL` is set; works with Groq, Together, Fireworks, Azure OpenAI, DeepSeek, xAI, OpenRouter, Ollama, vLLM, LocalAI, Perplexity, corporate gateways, etc.)
 *   - `anthropic`          — Anthropic Messages API
 *   - `google`             — Google Generative Language API (Gemini)
 *   - `bedrock`            — Amazon Bedrock Converse API (signed with an in-house SigV4 implementation)
 *   - `mistral`            — Mistral Chat Completions API (OpenAI-compatible shape)
 *   - `cohere`             — Cohere Chat API (v2)
 *   - `groq`               — Groq's OpenAI-compatible Chat Completions API
 *   - `xai`                — xAI's OpenAI-compatible Chat Completions API
 *   - `deepseek`           — DeepSeek's OpenAI-compatible Chat Completions API
 *
 * `LLM_PROVIDER` selects explicitly; otherwise the resolver auto-detects based on the set env vars.
 */

import type { ChatModel } from "./llmClient.js";
import { createAnthropicChatModel } from "./providers/anthropic.js";
import {
  resolveAwsCredentials,
  resolveAwsRegion,
} from "./providers/awsCredentials.js";
import { createBedrockChatModel } from "./providers/bedrock.js";
import { createCohereChatModel } from "./providers/cohere.js";
import { createGoogleChatModel } from "./providers/google.js";
import { createOpenAiChatModel } from "./providers/openaiChat.js";

export type LlmProviderId =
  | "openai"
  | "openai-compatible"
  | "anthropic"
  | "google"
  | "bedrock"
  | "mistral"
  | "cohere"
  | "groq"
  | "xai"
  | "deepseek";

const DEFAULT_MODEL_BY_PROVIDER: Record<LlmProviderId, string> = {
  openai: "gpt-4o-mini",
  "openai-compatible": "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  google: "gemini-2.0-flash",
  bedrock: "anthropic.claude-3-5-haiku-20241022-v1:0",
  mistral: "mistral-small-latest",
  cohere: "command-r-08-2024",
  groq: "llama-3.1-8b-instant",
  xai: "grok-2-latest",
  deepseek: "deepseek-chat",
};

const VALID_PROVIDERS: ReadonlySet<LlmProviderId> = new Set([
  "openai",
  "openai-compatible",
  "anthropic",
  "google",
  "bedrock",
  "mistral",
  "cohere",
  "groq",
  "xai",
  "deepseek",
]);

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function isValidProviderId(value: string): value is LlmProviderId {
  return VALID_PROVIDERS.has(value as LlmProviderId);
}

/** `LLM_BASE_URL` wins over `OPENAI_BASE_URL` when set. */
export function resolveLlmBaseUrl(): string | undefined {
  return readEnv("LLM_BASE_URL") ?? readEnv("OPENAI_BASE_URL");
}

function parseHeaderJsonObject(
  raw: string | undefined,
): Record<string, string> {
  // Stryker disable next-line MethodExpression
  const trimmed = raw?.trim();
  // Stryker disable next-line ConditionalExpression
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      typeof parsed !== "object" ||
      // Stryker disable next-line ConditionalExpression
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.length > 0) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    // Stryker disable next-line BlockStatement
    return {};
  }
}

/**
 * Merged default headers for OpenAI / OpenAI-compatible gateways:
 * `OPENAI_DEFAULT_HEADERS` first, then `LLM_DEFAULT_HEADERS` overrides.
 */
export function parseLlmDefaultHeadersFromEnv():
  | Record<string, string>
  | undefined {
  const base = parseHeaderJsonObject(process.env.OPENAI_DEFAULT_HEADERS);
  const override = parseHeaderJsonObject(process.env.LLM_DEFAULT_HEADERS);
  const merged = { ...base, ...override };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function resolveOpenAiApiKey(): string | undefined {
  return readEnv("LLM_API_KEY") ?? readEnv("OPENAI_API_KEY");
}

/**
 * Returns the explicit `LLM_PROVIDER` if set and valid, otherwise auto-detects
 * from the set env vars. Returns `undefined` when nothing is configured.
 */
export function detectLlmProvider(): LlmProviderId | undefined {
  const explicit = readEnv("LLM_PROVIDER")?.toLowerCase();
  if (explicit && isValidProviderId(explicit)) {
    return explicit;
  }
  if (resolveLlmBaseUrl()) {
    return "openai-compatible";
  }
  if (resolveOpenAiApiKey()) {
    return "openai";
  }
  if (readEnv("ANTHROPIC_API_KEY")) return "anthropic";
  if (readEnv("GOOGLE_GENERATIVE_AI_API_KEY") ?? readEnv("GOOGLE_API_KEY"))
    return "google";
  if (readEnv("MISTRAL_API_KEY")) return "mistral";
  if (readEnv("COHERE_API_KEY")) return "cohere";
  if (readEnv("GROQ_API_KEY")) return "groq";
  if (readEnv("XAI_API_KEY")) return "xai";
  if (readEnv("DEEPSEEK_API_KEY")) return "deepseek";
  if (readEnv("AWS_ACCESS_KEY_ID") ?? readEnv("AWS_PROFILE")) return "bedrock";
  if (parseLlmDefaultHeadersFromEnv()) return "openai";
  return undefined;
}

/** True when any supported provider can be resolved from env vars. */
export function isLlmProviderConfigured(): boolean {
  return detectLlmProvider() !== undefined;
}

/** Default chat model id for the given provider. */
export function defaultModelForProvider(provider: LlmProviderId): string {
  return DEFAULT_MODEL_BY_PROVIDER[provider];
}

function createOpenAiModel(modelId: string): ChatModel {
  return createOpenAiChatModel({
    baseURL: "https://api.openai.com/v1",
    modelId,
    apiKey: resolveOpenAiApiKey(),
    headers: parseLlmDefaultHeadersFromEnv(),
    label: "OpenAI",
  });
}

function createOpenAiCompatibleModel(modelId: string): ChatModel {
  const baseURL = resolveLlmBaseUrl();
  if (!baseURL) {
    throw new Error(
      "openai-compatible provider requires LLM_BASE_URL or OPENAI_BASE_URL to be set.",
    );
  }
  return createOpenAiChatModel({
    baseURL,
    modelId,
    apiKey: resolveOpenAiApiKey(),
    headers: parseLlmDefaultHeadersFromEnv(),
    label: readEnv("LLM_PROVIDER_NAME") ?? "openai-compatible",
  });
}

function createAnthropicModel(modelId: string): ChatModel {
  return createAnthropicChatModel({
    modelId,
    apiKey: readEnv("ANTHROPIC_API_KEY"),
  });
}

function createGoogleModel(modelId: string): ChatModel {
  const apiKey =
    readEnv("GOOGLE_GENERATIVE_AI_API_KEY") ?? readEnv("GOOGLE_API_KEY");
  return createGoogleChatModel({ modelId, apiKey });
}

function createBedrockModel(modelId: string): ChatModel {
  return createBedrockChatModel({
    modelId,
    region: resolveAwsRegion(),
    getCredentials: resolveAwsCredentials,
  });
}

function createMistralModel(modelId: string): ChatModel {
  return createOpenAiChatModel({
    baseURL: "https://api.mistral.ai/v1",
    modelId,
    apiKey: readEnv("MISTRAL_API_KEY"),
    label: "Mistral",
  });
}

function createCohereModel(modelId: string): ChatModel {
  return createCohereChatModel({ modelId, apiKey: readEnv("COHERE_API_KEY") });
}

function createGroqModel(modelId: string): ChatModel {
  return createOpenAiChatModel({
    baseURL: "https://api.groq.com/openai/v1",
    modelId,
    apiKey: readEnv("GROQ_API_KEY"),
    label: "Groq",
  });
}

function createXaiModel(modelId: string): ChatModel {
  return createOpenAiChatModel({
    baseURL: "https://api.x.ai/v1",
    modelId,
    apiKey: readEnv("XAI_API_KEY"),
    label: "xAI",
  });
}

function createDeepseekModel(modelId: string): ChatModel {
  return createOpenAiChatModel({
    baseURL: "https://api.deepseek.com/v1",
    modelId,
    apiKey: readEnv("DEEPSEEK_API_KEY"),
    label: "DeepSeek",
  });
}

export type ResolveLanguageModelOptions = {
  provider?: LlmProviderId;
  model?: string;
};

/**
 * Resolve an in-house `ChatModel` for the requested provider and model.
 *
 * Resolution order for the provider:
 *   1. `options.provider`
 *   2. `LLM_PROVIDER` env var
 *   3. auto-detect from env vars ({@link detectLlmProvider})
 *
 * Resolution order for the model id:
 *   1. `options.model`
 *   2. `LLM_MODEL` env var
 *   3. provider default ({@link defaultModelForProvider})
 */
export async function resolveLanguageModel(
  options: ResolveLanguageModelOptions = {},
): Promise<ChatModel> {
  const provider = options.provider ?? detectLlmProvider();
  if (!provider) {
    throw new Error(
      "No LLM provider could be resolved. Set LLM_PROVIDER or a provider API key " +
        "(OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, MISTRAL_API_KEY, " +
        "COHERE_API_KEY, GROQ_API_KEY, XAI_API_KEY, DEEPSEEK_API_KEY), or LLM_BASE_URL for an OpenAI-compatible gateway.",
    );
  }
  const modelId =
    options.model ?? readEnv("LLM_MODEL") ?? defaultModelForProvider(provider);

  switch (provider) {
    case "openai":
      return createOpenAiModel(modelId);
    case "openai-compatible":
      return createOpenAiCompatibleModel(modelId);
    case "anthropic":
      return createAnthropicModel(modelId);
    case "google":
      return createGoogleModel(modelId);
    case "bedrock":
      return createBedrockModel(modelId);
    case "mistral":
      return createMistralModel(modelId);
    case "cohere":
      return createCohereModel(modelId);
    case "groq":
      return createGroqModel(modelId);
    case "xai":
      return createXaiModel(modelId);
    case "deepseek":
      return createDeepseekModel(modelId);
    // Stryker disable all
    /* istanbul ignore next -- exhaustive switch */
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unhandled LLM provider: ${String(_exhaustive)}`);
    }
    // Stryker restore all
  }
}
