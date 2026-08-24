import { createAnthropicChatModel } from "../src/ai/providers/anthropic";

const callOptions = {
  system: "s",
  prompt: "p",
  temperature: 0.2,
  maxOutputTokens: 100,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createAnthropicChatModel", () => {
  it("joins only text-type content blocks and reports full usage incl. cache reads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [
              { type: "text", text: "part one " },
              { type: "tool_use", text: "ignored" },
              { type: "text", text: "part two" },
            ],
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              cache_read_input_tokens: 2,
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const model = createAnthropicChatModel({ modelId: "claude", apiKey: "k" });
    const result = await model.generate(callOptions);

    expect(result.text).toBe("part one part two");
    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cachedInputTokens: 2,
    });
  });

  it("omits totalTokens and text when content/usage are entirely absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ content: [] }), { status: 200 }),
        ),
    );

    const model = createAnthropicChatModel({ modelId: "claude" });
    const result = await model.generate(callOptions);

    expect(result.text).toBe("");
    expect(result.usage.totalTokens).toBeUndefined();
  });

  it("omits the x-api-key header when no apiKey is set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ content: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const model = createAnthropicChatModel({ modelId: "claude" });
    await model.generate(callOptions);

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("respects a custom baseURL, trimming a trailing slash", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ content: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const model = createAnthropicChatModel({
      modelId: "claude",
      baseURL: "https://proxy.example/",
    });
    await model.generate(callOptions);

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://proxy.example/v1/messages");
  });
});
