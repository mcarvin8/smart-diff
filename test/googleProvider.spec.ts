import { createGoogleChatModel } from "../src/ai/providers/google";

const callOptions = {
  system: "s",
  prompt: "p",
  temperature: 0.2,
  maxOutputTokens: 100,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createGoogleChatModel", () => {
  it("joins multi-part candidate text and reports full usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: "hello " }, { text: "world" }] } },
            ],
            usageMetadata: {
              promptTokenCount: 3,
              candidatesTokenCount: 4,
              totalTokenCount: 7,
              cachedContentTokenCount: 1,
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const model = createGoogleChatModel({ modelId: "gemini", apiKey: "k" });
    const result = await model.generate(callOptions);

    expect(result.text).toBe("hello world");
    expect(result.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
      cachedInputTokens: 1,
    });
  });

  it("returns empty text and undefined usage when candidates/usageMetadata are absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );

    const model = createGoogleChatModel({ modelId: "gemini" });
    const result = await model.generate(callOptions);

    expect(result.text).toBe("");
    expect(result.usage).toEqual({
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
      cachedInputTokens: undefined,
    });
  });

  it("omits the x-goog-api-key header when no apiKey is set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const model = createGoogleChatModel({ modelId: "gemini" });
    await model.generate(callOptions);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent",
    );
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBeUndefined();
  });
});
