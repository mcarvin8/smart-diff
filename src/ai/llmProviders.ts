/**
 * Resolves a Vercel AI SDK `LanguageModel` for the configured provider, using
 * lazy dynamic imports so optional provider SDKs are only loaded when requested.
 *
 * Providers:
 *   - `openai`             — `@ai-sdk/openai` (default when only OpenAI creds are set)
 *   - `openai-compatible`  — `@ai-sdk/openai-compatible` (default when `LLM_BASE_URL`/`OPENAI_BASE_URL` is set; works with Groq, Together, Fireworks, Azure OpenAI, DeepSeek, xAI, OpenRouter, Ollama, vLLM, LocalAI, Perplexity, corporate gateways, etc.)
 *   - `anthropic`          — `@ai-sdk/anthropic`
 *   - `google`             — `@ai-sdk/google` (Gemini)
 *   - `bedrock`            — `@ai-sdk/amazon-bedrock`
 *   - `mistral`            — `@ai-sdk/mistral` (native API)
 *   - `cohere`             — `@ai-sdk/cohere`
 *   - `groq`               — `@ai-sdk/groq`
 *   - `xai`                — `@ai-sdk/xai`
 *   - `deepseek`           — `@ai-sdk/deepseek`
 *
 * `LLM_PROVIDER` selects explicitly; otherwise the resolver auto-detects based on the set env vars.
 */

import type { LanguageModel } from "ai";

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
  anthropic: "claude-3-5-haiku-latest",
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
  const trimmed = raw?.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      typeof parsed !== "object" ||
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

async function createOpenAiModel(modelId: string): Promise<LanguageModel> {
  const { createOpenAI } = await import("@ai-sdk/openai");
  const apiKey = resolveOpenAiApiKey();
  const headers = parseLlmDefaultHeadersFromEnv();
  const provider = createOpenAI({
    ...(apiKey ? { apiKey } : {}),
    ...(headers ? { headers } : {}),
  });
  return provider(modelId);
}

async function createOpenAiCompatibleModel(
  modelId: string,
): Promise<LanguageModel> {
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const baseURL = resolveLlmBaseUrl();
  if (!baseURL) {
    throw new Error(
      "openai-compatible provider requires LLM_BASE_URL or OPENAI_BASE_URL to be set.",
    );
  }
  const apiKey = resolveOpenAiApiKey();
  const headers = parseLlmDefaultHeadersFromEnv();
  const provider = createOpenAICompatible({
    name: readEnv("LLM_PROVIDER_NAME") ?? "openai-compatible",
    baseURL,
    ...(apiKey ? { apiKey } : {}),
    ...(headers ? { headers } : {}),
  });
  return provider(modelId);
}

type ImportFailure = {
  provider: LlmProviderId;
  pkg: string;
  cause: unknown;
};

function wrapMissingPeer(failure: ImportFailure): Error {
  const err = new Error(
    `Failed to load optional provider package "${failure.pkg}" for LLM_PROVIDER="${failure.provider}". ` +
      `Install it with \`npm install ${failure.pkg}\`.`,
  );
  (err as Error & { cause?: unknown }).cause = failure.cause;
  return err;
}

async function importOptional<T>(
  provider: LlmProviderId,
  pkg: string,
  loader: () => Promise<T>,
): Promise<T> {
  try {
    return await loader();
  } catch (cause) {
    throw wrapMissingPeer({ provider, pkg, cause });
  }
}

async function createAnthropicModel(modelId: string): Promise<LanguageModel> {
  const mod = await importOptional(
    "anthropic",
    "@ai-sdk/anthropic",
    () =>
      import("@ai-sdk/anthropic") as unknown as Promise<{
        createAnthropic: (options?: { apiKey?: string }) => (
          modelId: string,
        ) => LanguageModel;
      }>,
  );
  const apiKey = readEnv("ANTHROPIC_API_KEY");
  const provider = mod.createAnthropic(apiKey ? { apiKey } : undefined);
  return provider(modelId);
}

async function createGoogleModel(modelId: string): Promise<LanguageModel> {
  const mod = await importOptional(
    "google",
    "@ai-sdk/google",
    () =>
      import("@ai-sdk/google") as unknown as Promise<{
        createGoogleGenerativeAI: (options?: { apiKey?: string }) => (
          modelId: string,
        ) => LanguageModel;
      }>,
  );
  const apiKey =
    readEnv("GOOGLE_GENERATIVE_AI_API_KEY") ?? readEnv("GOOGLE_API_KEY");
  const provider = mod.createGoogleGenerativeAI(
    apiKey ? { apiKey } : undefined,
  );
  return provider(modelId);
}

async function createBedrockModel(modelId: string): Promise<LanguageModel> {
  const mod = await importOptional(
    "bedrock",
    "@ai-sdk/amazon-bedrock",
    () =>
      import("@ai-sdk/amazon-bedrock") as unknown as Promise<{
        createAmazonBedrock: (options?: Record<string, unknown>) => (
          modelId: string,
        ) => LanguageModel;
      }>,
  );
  const provider = mod.createAmazonBedrock();
  return provider(modelId);
}

async function createMistralModel(modelId: string): Promise<LanguageModel> {
  const mod = await importOptional(
    "mistral",
    "@ai-sdk/mistral",
    () =>
      import("@ai-sdk/mistral") as unknown as Promise<{
        createMistral: (options?: { apiKey?: string }) => (
          modelId: string,
        ) => LanguageModel;
      }>,
  );
  const apiKey = readEnv("MISTRAL_API_KEY");
  const provider = mod.createMistral(apiKey ? { apiKey } : undefined);
  return provider(modelId);
}

async function createCohereModel(modelId: string): Promise<LanguageModel> {
  const mod = await importOptional(
    "cohere",
    "@ai-sdk/cohere",
    () =>
      import("@ai-sdk/cohere") as unknown as Promise<{
        createCohere: (options?: { apiKey?: string }) => (
          modelId: string,
        ) => LanguageModel;
      }>,
  );
  const apiKey = readEnv("COHERE_API_KEY");
  const provider = mod.createCohere(apiKey ? { apiKey } : undefined);
  return provider(modelId);
}

async function createGroqModel(modelId: string): Promise<LanguageModel> {
  const mod = await importOptional(
    "groq",
    "@ai-sdk/groq",
    () =>
      import("@ai-sdk/groq") as unknown as Promise<{
        createGroq: (options?: { apiKey?: string }) => (
          modelId: string,
        ) => LanguageModel;
      }>,
  );
  const apiKey = readEnv("GROQ_API_KEY");
  const provider = mod.createGroq(apiKey ? { apiKey } : undefined);
  return provider(modelId);
}

async function createXaiModel(modelId: string): Promise<LanguageModel> {
  const mod = await importOptional(
    "xai",
    "@ai-sdk/xai",
    () =>
      import("@ai-sdk/xai") as unknown as Promise<{
        createXai: (options?: { apiKey?: string }) => (
          modelId: string,
        ) => LanguageModel;
      }>,
  );
  const apiKey = readEnv("XAI_API_KEY");
  const provider = mod.createXai(apiKey ? { apiKey } : undefined);
  return provider(modelId);
}

async function createDeepseekModel(modelId: string): Promise<LanguageModel> {
  const mod = await importOptional(
    "deepseek",
    "@ai-sdk/deepseek",
    () =>
      import("@ai-sdk/deepseek") as unknown as Promise<{
        createDeepSeek: (options?: { apiKey?: string }) => (
          modelId: string,
        ) => LanguageModel;
      }>,
  );
  const apiKey = readEnv("DEEPSEEK_API_KEY");
  const provider = mod.createDeepSeek(apiKey ? { apiKey } : undefined);
  return provider(modelId);
}

export type ResolveLanguageModelOptions = {
  provider?: LlmProviderId;
  model?: string;
};

/**
 * Resolve a Vercel AI SDK `LanguageModel` for the requested provider and model.
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
): Promise<LanguageModel> {
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
    /* istanbul ignore next -- exhaustive switch */
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unhandled LLM provider: ${String(_exhaustive)}`);
    }
  }
}
