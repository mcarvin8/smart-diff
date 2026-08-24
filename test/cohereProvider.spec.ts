import { createCohereChatModel } from "../src/ai/providers/cohere";

const callOptions = {
  system: "s",
  prompt: "p",
  temperature: 0.2,
  maxOutputTokens: 100,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCohereChatModel", () => {
  it("prefers usage.tokens over usage.billed_units", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { content: [{ type: "text", text: "hi" }] },
            usage: {
              tokens: { input_tokens: 5, output_tokens: 2 },
              billed_units: { input_tokens: 99, output_tokens: 99 },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const model = createCohereChatModel({ modelId: "command", apiKey: "k" });
    const result = await model.generate(callOptions);

    expect(result.text).toBe("hi");
    expect(result.usage).toEqual({
      inputTokens: 5,
      outputTokens: 2,
      totalTokens: 7,
    });
  });

  it("falls back to usage.billed_units when tokens is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { content: [{ type: "text", text: "hi" }] },
            usage: { billed_units: { input_tokens: 3, output_tokens: 1 } },
          }),
          { status: 200 },
        ),
      ),
    );

    const model = createCohereChatModel({ modelId: "command" });
    const result = await model.generate(callOptions);

    expect(result.usage).toEqual({
      inputTokens: 3,
      outputTokens: 1,
      totalTokens: 4,
    });
  });

  it("returns empty text and undefined totalTokens when message/usage are absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );

    const model = createCohereChatModel({ modelId: "command" });
    const result = await model.generate(callOptions);

    expect(result.text).toBe("");
    expect(result.usage.totalTokens).toBeUndefined();
  });

  it("omits the authorization header when no apiKey is set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const model = createCohereChatModel({ modelId: "command" });
    await model.generate(callOptions);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.cohere.com/v2/chat");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });
});
