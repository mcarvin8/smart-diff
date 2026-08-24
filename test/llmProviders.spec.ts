import {
  defaultModelForProvider,
  detectLlmProvider,
  isLlmProviderConfigured,
  type LlmProviderId,
  parseLlmDefaultHeadersFromEnv,
  resolveLanguageModel,
  resolveLlmBaseUrl,
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
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_PROFILE",
];

function clearProviderEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

const CALL_OPTIONS = {
  system: "sys prompt",
  prompt: "user prompt",
  temperature: 0.3,
  maxOutputTokens: 512,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetchOnce(response: Response) {
  const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

    it("returns undefined for whitespace-only LLM_BASE_URL", () => {
      process.env.LLM_BASE_URL = "   ";
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

    it("returns undefined for null JSON value", () => {
      process.env.OPENAI_DEFAULT_HEADERS = "null";
      expect(parseLlmDefaultHeadersFromEnv()).toBeUndefined();
    });

    it("returns undefined for JSON string primitive", () => {
      process.env.OPENAI_DEFAULT_HEADERS = '"hello"';
      expect(parseLlmDefaultHeadersFromEnv()).toBeUndefined();
    });

    it("returns undefined for JSON string array with string values", () => {
      process.env.OPENAI_DEFAULT_HEADERS = '["a","b"]';
      expect(parseLlmDefaultHeadersFromEnv()).toBeUndefined();
    });

    it("excludes empty-string header values", () => {
      process.env.OPENAI_DEFAULT_HEADERS = JSON.stringify({
        "X-Empty": "",
        "X-Ok": "1",
      });
      expect(parseLlmDefaultHeadersFromEnv()).toEqual({ "X-Ok": "1" });
    });
  });

  describe("detectLlmProvider", () => {
    it("returns undefined when nothing configured", () => {
      expect(detectLlmProvider()).toBeUndefined();
      expect(isLlmProviderConfigured()).toBe(false);
    });

    it("isLlmProviderConfigured returns true when provider configured", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      expect(isLlmProviderConfigured()).toBe(true);
    });

    it("honors explicit LLM_PROVIDER", () => {
      process.env.LLM_PROVIDER = "anthropic";
      expect(detectLlmProvider()).toBe("anthropic");
    });

    it("honors explicit LLM_PROVIDER for each valid provider", () => {
      const providers = [
        "google",
        "mistral",
        "cohere",
        "groq",
        "xai",
        "deepseek",
        "bedrock",
      ] as const;
      for (const p of providers) {
        clearProviderEnv();
        process.env.LLM_PROVIDER = p;
        expect(detectLlmProvider()).toBe(p);
      }
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

    it("auto-detects bedrock from AWS_ACCESS_KEY_ID", () => {
      process.env.AWS_ACCESS_KEY_ID = "AKIA000";
      expect(detectLlmProvider()).toBe("bedrock");
    });

    it("auto-detects bedrock from AWS_PROFILE", () => {
      process.env.AWS_PROFILE = "default";
      expect(detectLlmProvider()).toBe("bedrock");
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
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("throws when no provider is resolvable", async () => {
    await expect(resolveLanguageModel()).rejects.toThrow(
      /No LLM provider could be resolved/,
    );
  });

  it("throws when openai-compatible is selected without a base URL", async () => {
    process.env.LLM_PROVIDER = "openai-compatible";
    await expect(resolveLanguageModel()).rejects.toThrow(
      /requires LLM_BASE_URL/,
    );
  });

  it("error message includes all provider env var names", async () => {
    await expect(resolveLanguageModel()).rejects.toThrow(
      /OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, MISTRAL_API_KEY/,
    );
  });

  it("error message includes remaining provider env var names", async () => {
    await expect(resolveLanguageModel()).rejects.toThrow(
      /COHERE_API_KEY, GROQ_API_KEY, XAI_API_KEY, DEEPSEEK_API_KEY/,
    );
  });

  it("error message mentions LLM_BASE_URL", async () => {
    await expect(resolveLanguageModel()).rejects.toThrow(/LLM_BASE_URL/);
  });

  it("uses LLM_MODEL env when options.model is absent", async () => {
    process.env.OPENAI_API_KEY = "sk-k";
    process.env.LLM_MODEL = "gpt-4.1-mini";
    const fetchMock = mockFetchOnce(jsonResponse({ choices: [] }));
    const model = await resolveLanguageModel();
    await model.generate(CALL_OPTIONS);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string).model).toBe(
      "gpt-4.1-mini",
    );
  });

  describe("openai", () => {
    it("sends the API key, merged default headers, and call options", async () => {
      process.env.OPENAI_API_KEY = "sk-real";
      process.env.OPENAI_DEFAULT_HEADERS = JSON.stringify({ "X-Custom": "1" });
      const fetchMock = mockFetchOnce(
        jsonResponse({
          choices: [{ message: { content: "hello" } }],
          usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
        }),
      );

      const model = await resolveLanguageModel({ model: "gpt-test" });
      const result = await model.generate(CALL_OPTIONS);

      expect(result).toEqual({
        text: "hello",
        usage: {
          inputTokens: 5,
          outputTokens: 7,
          totalTokens: 12,
          cachedInputTokens: undefined,
        },
      });

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer sk-real");
      expect(headers["X-Custom"]).toBe("1");
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toEqual({
        model: "gpt-test",
        messages: [
          { role: "system", content: CALL_OPTIONS.system },
          { role: "user", content: CALL_OPTIONS.prompt },
        ],
        temperature: CALL_OPTIONS.temperature,
        max_tokens: CALL_OPTIONS.maxOutputTokens,
      });
    });

    it("omits the authorization header when no API key is set", async () => {
      process.env.LLM_PROVIDER = "openai";
      const fetchMock = mockFetchOnce(jsonResponse({ choices: [] }));
      const model = await resolveLanguageModel();
      await model.generate(CALL_OPTIONS);
      const [, init] = fetchMock.mock.calls[0]!;
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.authorization).toBeUndefined();
    });
  });

  describe("openai-compatible", () => {
    it("posts to baseURL/chat/completions with apiKey and headers", async () => {
      process.env.LLM_BASE_URL = "https://gateway.example/v1/";
      process.env.LLM_API_KEY = "sk-llm";
      process.env.LLM_DEFAULT_HEADERS = JSON.stringify({
        "x-company-rbac": "token",
      });

      const fetchMock = mockFetchOnce(
        jsonResponse({ choices: [{ message: { content: "ok" } }] }),
      );
      const model = await resolveLanguageModel({ model: "router/gpt" });
      await model.generate(CALL_OPTIONS);

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe("https://gateway.example/v1/chat/completions");
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer sk-llm");
      expect(headers["x-company-rbac"]).toBe("token");
    });
  });

  describe("anthropic", () => {
    it("posts to the messages API with x-api-key and anthropic-version", async () => {
      process.env.ANTHROPIC_API_KEY = "ant-key";
      const fetchMock = mockFetchOnce(
        jsonResponse({
          content: [{ type: "text", text: "hi" }],
          usage: { input_tokens: 3, output_tokens: 4 },
        }),
      );

      const model = await resolveLanguageModel({ provider: "anthropic" });
      const result = await model.generate(CALL_OPTIONS);

      expect(result.text).toBe("hi");
      expect(result.usage).toEqual({
        inputTokens: 3,
        outputTokens: 4,
        totalTokens: 7,
        cachedInputTokens: undefined,
      });

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("ant-key");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.system).toBe(CALL_OPTIONS.system);
      expect(body.messages).toEqual([
        { role: "user", content: CALL_OPTIONS.prompt },
      ]);
    });

    it("dispatches without requiring an API key env var", async () => {
      const model = await resolveLanguageModel({ provider: "anthropic" });
      expect(model).toBeDefined();
    });
  });

  describe("google", () => {
    it("posts to generateContent with x-goog-api-key, using GOOGLE_API_KEY fallback", async () => {
      process.env.GOOGLE_API_KEY = "ga-key";
      const fetchMock = mockFetchOnce(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: "gemini says hi" }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
        }),
      );

      const model = await resolveLanguageModel({
        provider: "google",
        model: "gemini-test",
      });
      const result = await model.generate(CALL_OPTIONS);

      expect(result.text).toBe("gemini says hi");
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
      );
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers["x-goog-api-key"]).toBe("ga-key");
    });
  });

  describe("cohere", () => {
    it("posts to the v2 chat API with a bearer token", async () => {
      process.env.COHERE_API_KEY = "coh-key";
      const fetchMock = mockFetchOnce(
        jsonResponse({
          message: { content: [{ type: "text", text: "cohere reply" }] },
          usage: { tokens: { input_tokens: 9, output_tokens: 1 } },
        }),
      );

      const model = await resolveLanguageModel({ provider: "cohere" });
      const result = await model.generate(CALL_OPTIONS);

      expect(result.text).toBe("cohere reply");
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe("https://api.cohere.com/v2/chat");
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer coh-key");
    });
  });

  describe.each([
    [
      "mistral",
      "MISTRAL_API_KEY",
      "https://api.mistral.ai/v1/chat/completions",
    ],
    ["groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1/chat/completions"],
    ["xai", "XAI_API_KEY", "https://api.x.ai/v1/chat/completions"],
    [
      "deepseek",
      "DEEPSEEK_API_KEY",
      "https://api.deepseek.com/v1/chat/completions",
    ],
  ] as const)("%s (OpenAI-compatible)", (provider, envKey, expectedUrl) => {
    it(`posts to ${expectedUrl} with a bearer token`, async () => {
      process.env[envKey] = "secret";
      const fetchMock = mockFetchOnce(
        jsonResponse({ choices: [{ message: { content: "ok" } }] }),
      );

      const model = await resolveLanguageModel({ provider });
      expect(model).toBeDefined();
      await model.generate(CALL_OPTIONS);

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(expectedUrl);
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer secret");
    });

    it("dispatches without requiring an API key env var", async () => {
      const model = await resolveLanguageModel({ provider });
      expect(model).toBeDefined();
    });
  });

  describe("bedrock", () => {
    it("dispatches without requiring AWS credentials at resolve time", async () => {
      process.env.LLM_PROVIDER = "bedrock";
      const model = await resolveLanguageModel();
      expect(model).toBeDefined();
    });

    it("throws a clear error from generate() when no credentials are available", async () => {
      const model = await resolveLanguageModel({ provider: "bedrock" });
      await expect(model.generate(CALL_OPTIONS)).rejects.toThrow(
        /requires AWS credentials/,
      );
    });

    it("signs the Converse API request with SigV4 when credentials are set", async () => {
      process.env.AWS_ACCESS_KEY_ID = "AKIAFAKE";
      process.env.AWS_SECRET_ACCESS_KEY = "fake-secret";
      process.env.AWS_REGION = "us-west-2";

      const fetchMock = mockFetchOnce(
        jsonResponse({
          output: { message: { content: [{ text: "bedrock reply" }] } },
          usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
        }),
      );

      const model = await resolveLanguageModel({
        provider: "bedrock",
        model: "anthropic.claude-3-5-haiku-20241022-v1:0",
      });
      const result = await model.generate(CALL_OPTIONS);

      expect(result.text).toBe("bedrock reply");
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toBe(
        "https://bedrock-runtime.us-west-2.amazonaws.com/model/anthropic.claude-3-5-haiku-20241022-v1%3A0/converse",
      );
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.authorization).toMatch(
        /^AWS4-HMAC-SHA256 Credential=AKIAFAKE\//,
      );
    });
  });
});
