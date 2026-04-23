jest.mock("@ai-sdk/openai", () => ({
  __esModule: true,
  createOpenAI: jest.fn(() => (modelId: string) => ({
    providerName: "openai",
    modelId,
  })),
}));

jest.mock("@ai-sdk/openai-compatible", () => ({
  __esModule: true,
  createOpenAICompatible: jest.fn((settings: Record<string, unknown>) => {
    return (modelId: string) => ({
      providerName: "openai-compatible",
      modelId,
      settings,
    });
  }),
}));

jest.mock(
  "@ai-sdk/anthropic",
  () => ({
    __esModule: true,
    createAnthropic: jest.fn(() => (modelId: string) => ({
      providerName: "anthropic",
      modelId,
    })),
  }),
  { virtual: true },
);

jest.mock(
  "@ai-sdk/google",
  () => ({
    __esModule: true,
    createGoogleGenerativeAI: jest.fn(() => (modelId: string) => ({
      providerName: "google",
      modelId,
    })),
  }),
  { virtual: true },
);

jest.mock(
  "@ai-sdk/amazon-bedrock",
  () => ({
    __esModule: true,
    createAmazonBedrock: jest.fn(() => (modelId: string) => ({
      providerName: "bedrock",
      modelId,
    })),
  }),
  { virtual: true },
);

jest.mock(
  "@ai-sdk/mistral",
  () => ({
    __esModule: true,
    createMistral: jest.fn(() => (modelId: string) => ({
      providerName: "mistral",
      modelId,
    })),
  }),
  { virtual: true },
);

jest.mock(
  "@ai-sdk/cohere",
  () => ({
    __esModule: true,
    createCohere: jest.fn(() => (modelId: string) => ({
      providerName: "cohere",
      modelId,
    })),
  }),
  { virtual: true },
);

jest.mock(
  "@ai-sdk/groq",
  () => ({
    __esModule: true,
    createGroq: jest.fn(() => (modelId: string) => ({
      providerName: "groq",
      modelId,
    })),
  }),
  { virtual: true },
);

jest.mock(
  "@ai-sdk/xai",
  () => ({
    __esModule: true,
    createXai: jest.fn(() => (modelId: string) => ({
      providerName: "xai",
      modelId,
    })),
  }),
  { virtual: true },
);

jest.mock(
  "@ai-sdk/deepseek",
  () => ({
    __esModule: true,
    createDeepSeek: jest.fn(() => (modelId: string) => ({
      providerName: "deepseek",
      modelId,
    })),
  }),
  { virtual: true },
);

import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import {
  defaultModelForProvider,
  detectLlmProvider,
  isLlmProviderConfigured,
  parseLlmDefaultHeadersFromEnv,
  resolveLanguageModel,
  resolveLlmBaseUrl,
  type LlmProviderId,
} from "../src/ai/llmProviders";

const ENV_KEYS = [
  "LLM_PROVIDER",
  "LLM_PROVIDER_NAME",
  "LLM_MODEL",
  "LLM_BASE_URL",
  "OPENAI_BASE_URL",
  "LLM_API_KEY",
  "OPENAI_API_KEY",
  "LLM_DEFAULT_HEADERS",
  "OPENAI_DEFAULT_HEADERS",
  "ANTHROPIC_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_API_KEY",
  "MISTRAL_API_KEY",
  "COHERE_API_KEY",
  "GROQ_API_KEY",
  "XAI_API_KEY",
  "DEEPSEEK_API_KEY",
];

function clearProviderEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("llmProviders env helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearProviderEnv();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("resolveLlmBaseUrl", () => {
    it("prefers LLM_BASE_URL over OPENAI_BASE_URL", () => {
      process.env.OPENAI_BASE_URL = "https://openai.example";
      process.env.LLM_BASE_URL = "  https://llm.example  ";
      expect(resolveLlmBaseUrl()).toBe("https://llm.example");
    });

    it("falls back to OPENAI_BASE_URL", () => {
      process.env.OPENAI_BASE_URL = "https://only-openai";
      expect(resolveLlmBaseUrl()).toBe("https://only-openai");
    });

    it("returns undefined when unset", () => {
      expect(resolveLlmBaseUrl()).toBeUndefined();
    });
  });

  describe("parseLlmDefaultHeadersFromEnv", () => {
    it("returns undefined when no headers set", () => {
      expect(parseLlmDefaultHeadersFromEnv()).toBeUndefined();
    });

    it("merges OPENAI_DEFAULT_HEADERS with LLM_DEFAULT_HEADERS override", () => {
      process.env.OPENAI_DEFAULT_HEADERS = JSON.stringify({
        "X-A": "1",
        "X-B": "old",
      });
      process.env.LLM_DEFAULT_HEADERS = JSON.stringify({
        "X-B": "new",
        "X-C": "3",
      });
      expect(parseLlmDefaultHeadersFromEnv()).toEqual({
        "X-A": "1",
        "X-B": "new",
        "X-C": "3",
      });
    });

    it("returns undefined for invalid JSON", () => {
      process.env.OPENAI_DEFAULT_HEADERS = "{not json";
      expect(parseLlmDefaultHeadersFromEnv()).toBeUndefined();
    });

    it("ignores non-object JSON (arrays)", () => {
      process.env.OPENAI_DEFAULT_HEADERS = "[1,2,3]";
      expect(parseLlmDefaultHeadersFromEnv()).toBeUndefined();
    });

    it("ignores non-string header values", () => {
      process.env.OPENAI_DEFAULT_HEADERS = JSON.stringify({
        "X-Num": 42,
        "X-Ok": "yes",
      });
      expect(parseLlmDefaultHeadersFromEnv()).toEqual({ "X-Ok": "yes" });
    });
  });

  describe("detectLlmProvider", () => {
    it("returns undefined when nothing configured", () => {
      expect(detectLlmProvider()).toBeUndefined();
      expect(isLlmProviderConfigured()).toBe(false);
    });

    it("honors explicit LLM_PROVIDER", () => {
      process.env.LLM_PROVIDER = "anthropic";
      expect(detectLlmProvider()).toBe("anthropic");
    });

    it("ignores unknown LLM_PROVIDER values and falls back", () => {
      process.env.LLM_PROVIDER = "made-up";
      process.env.OPENAI_API_KEY = "sk-x";
      expect(detectLlmProvider()).toBe("openai");
    });

    it("auto-detects openai-compatible from base URL", () => {
      process.env.OPENAI_BASE_URL = "https://gateway.example/v1";
      expect(detectLlmProvider()).toBe("openai-compatible");
    });

    it("auto-detects openai from API key", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      expect(detectLlmProvider()).toBe("openai");
    });

    it("auto-detects other providers from their keys", () => {
      const cases: Array<[string, LlmProviderId]> = [
        ["ANTHROPIC_API_KEY", "anthropic"],
        ["GOOGLE_GENERATIVE_AI_API_KEY", "google"],
        ["GOOGLE_API_KEY", "google"],
        ["MISTRAL_API_KEY", "mistral"],
        ["COHERE_API_KEY", "cohere"],
        ["GROQ_API_KEY", "groq"],
        ["XAI_API_KEY", "xai"],
        ["DEEPSEEK_API_KEY", "deepseek"],
      ];
      for (const [envKey, provider] of cases) {
        clearProviderEnv();
        process.env[envKey] = "k";
        expect(detectLlmProvider()).toBe(provider);
      }
    });

    it("falls back to openai when only default headers are set", () => {
      process.env.LLM_DEFAULT_HEADERS = JSON.stringify({
        Authorization: "Bearer sk-x",
      });
      expect(detectLlmProvider()).toBe("openai");
    });
  });

  describe("defaultModelForProvider", () => {
    it("returns a non-empty model id for every provider", () => {
      const providers: LlmProviderId[] = [
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
      ];
      for (const p of providers) {
        expect(defaultModelForProvider(p).length).toBeGreaterThan(0);
      }
    });
  });
});

describe("resolveLanguageModel", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearProviderEnv();
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("throws when no provider is resolvable", async () => {
    await expect(resolveLanguageModel()).rejects.toThrow(
      /No LLM provider could be resolved/,
    );
  });

  it("uses openai provider with API key and optional headers", async () => {
    process.env.OPENAI_API_KEY = "sk-real";
    process.env.OPENAI_DEFAULT_HEADERS = JSON.stringify({ "X-Custom": "1" });
    const model = (await resolveLanguageModel({ model: "gpt-test" })) as unknown as {
      providerName: string;
      modelId: string;
    };
    expect(model.modelId).toBe("gpt-test");
    expect(model.providerName).toBe("openai");
    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-real",
      headers: { "X-Custom": "1" },
    });
  });

  it("uses openai provider with no init when only env var present", async () => {
    process.env.LLM_PROVIDER = "openai";
    const model = (await resolveLanguageModel()) as unknown as {
      providerName: string;
      modelId: string;
    };
    expect(model.providerName).toBe("openai");
    expect(model.modelId).toBe(defaultModelForProvider("openai"));
    expect(createOpenAI).toHaveBeenCalledWith({});
  });

  it("uses openai-compatible provider with baseURL, apiKey, and headers", async () => {
    process.env.LLM_BASE_URL = "https://gateway.example/v1";
    process.env.LLM_API_KEY = "sk-llm";
    process.env.LLM_DEFAULT_HEADERS = JSON.stringify({
      "x-company-rbac": "token",
    });
    process.env.LLM_PROVIDER_NAME = "corp-gateway";

    const model = (await resolveLanguageModel({ model: "router/gpt" })) as unknown as {
      providerName: string;
      modelId: string;
    };
    expect(model.modelId).toBe("router/gpt");
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: "corp-gateway",
      baseURL: "https://gateway.example/v1",
      apiKey: "sk-llm",
      headers: { "x-company-rbac": "token" },
    });
  });

  it("uses LLM_MODEL env when options.model is absent", async () => {
    process.env.OPENAI_API_KEY = "sk-k";
    process.env.LLM_MODEL = "gpt-4.1-mini";
    const model = (await resolveLanguageModel()) as unknown as { modelId: string };
    expect(model.modelId).toBe("gpt-4.1-mini");
  });

  it("throws when openai-compatible is selected without a base URL", async () => {
    process.env.LLM_PROVIDER = "openai-compatible";
    await expect(resolveLanguageModel()).rejects.toThrow(
      /requires LLM_BASE_URL/,
    );
  });

  it("dispatches to each optional provider", async () => {
    const cases: Array<[LlmProviderId, string]> = [
      ["anthropic", "ANTHROPIC_API_KEY"],
      ["google", "GOOGLE_GENERATIVE_AI_API_KEY"],
      ["mistral", "MISTRAL_API_KEY"],
      ["cohere", "COHERE_API_KEY"],
      ["groq", "GROQ_API_KEY"],
      ["xai", "XAI_API_KEY"],
      ["deepseek", "DEEPSEEK_API_KEY"],
    ];
    for (const [provider, envKey] of cases) {
      clearProviderEnv();
      process.env[envKey] = "secret";
      const model = (await resolveLanguageModel({ provider })) as unknown as {
        providerName: string;
        modelId: string;
      };
      expect(model.providerName).toBe(provider);
      expect(model.modelId).toBe(defaultModelForProvider(provider));
    }
  });

  it("dispatches to bedrock without requiring an api key env", async () => {
    process.env.LLM_PROVIDER = "bedrock";
    const model = (await resolveLanguageModel()) as unknown as {
      providerName: string;
      modelId: string;
    };
    expect(model.providerName).toBe("bedrock");
    expect(model.modelId).toBe(defaultModelForProvider("bedrock"));
  });

  it("uses openai-compatible with baseURL only and no name/apiKey/headers", async () => {
    process.env.LLM_BASE_URL = "https://plain-gateway.example/v1";
    const model = (await resolveLanguageModel({
      model: "router/plain",
    })) as unknown as { providerName: string; modelId: string };
    expect(model.modelId).toBe("router/plain");
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: "openai-compatible",
      baseURL: "https://plain-gateway.example/v1",
    });
  });

  it("constructs openai without apiKey or headers when unset", async () => {
    process.env.LLM_PROVIDER = "openai";
    await resolveLanguageModel();
    expect(createOpenAI).toHaveBeenCalledWith({});
  });

  it("dispatches to each optional provider without an API key env var", async () => {
    const providers: LlmProviderId[] = [
      "anthropic",
      "google",
      "mistral",
      "cohere",
      "groq",
      "xai",
      "deepseek",
    ];
    for (const provider of providers) {
      clearProviderEnv();
      const model = (await resolveLanguageModel({ provider })) as unknown as {
        providerName: string;
        modelId: string;
      };
      expect(model.providerName).toBe(provider);
      expect(model.modelId).toBe(defaultModelForProvider(provider));
    }
  });

  it("resolves google provider using GOOGLE_API_KEY fallback", async () => {
    process.env.GOOGLE_API_KEY = "ga-key";
    const model = (await resolveLanguageModel({
      provider: "google",
    })) as unknown as { providerName: string; modelId: string };
    expect(model.providerName).toBe("google");
  });

  it("wraps missing optional provider package with helpful message", async () => {
    jest.resetModules();
    jest.doMock(
      "@ai-sdk/anthropic",
      () => {
        throw new Error("Cannot find module '@ai-sdk/anthropic'");
      },
      { virtual: true },
    );
    const { resolveLanguageModel: resolveAgain } = await import(
      "../src/ai/llmProviders"
    );
    process.env.LLM_PROVIDER = "anthropic";
    await expect(resolveAgain()).rejects.toThrow(
      /Failed to load optional provider package "@ai-sdk\/anthropic"/,
    );
  });
});
