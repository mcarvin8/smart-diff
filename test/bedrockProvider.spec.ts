import { createBedrockChatModel } from "../src/ai/providers/bedrock";

const callOptions = {
  system: "s",
  prompt: "p",
  temperature: 0.1,
  maxOutputTokens: 50,
};

const credentials = { accessKeyId: "AKIAFAKE", secretAccessKey: "fake-secret" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createBedrockChatModel", () => {
  it("throws a plain, non-retryable error when no credentials are available", async () => {
    const model = createBedrockChatModel({
      modelId: "m",
      region: "us-east-1",
      getCredentials: () => undefined,
    });

    await expect(model.generate(callOptions)).rejects.toThrow(
      /requires AWS credentials/,
    );
  });

  it("wraps a network failure in a retryable LlmApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const model = createBedrockChatModel({
      modelId: "m",
      region: "us-east-1",
      getCredentials: () => credentials,
    });

    await expect(model.generate(callOptions)).rejects.toMatchObject({
      retryable: true,
    });
  });

  it("wraps a non-ok response, falling back to an empty body when text() fails", async () => {
    const response = new Response("", { status: 403 });
    vi.spyOn(response, "text").mockRejectedValue(new Error("nope"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const model = createBedrockChatModel({
      modelId: "m",
      region: "us-east-1",
      getCredentials: () => credentials,
    });

    await expect(model.generate(callOptions)).rejects.toMatchObject({
      statusCode: 403,
      retryable: false,
    });
  });

  it("joins multi-part Converse output and reports usage fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: {
              message: { content: [{ text: "hi" }, { text: " there" }] },
            },
            usage: {
              inputTokens: 2,
              outputTokens: 3,
              totalTokens: 5,
              cacheReadInputTokens: 1,
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const model = createBedrockChatModel({
      modelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
      region: "us-west-2",
      getCredentials: () => credentials,
    });
    const result = await model.generate(callOptions);

    expect(result.text).toBe("hi there");
    expect(result.usage).toEqual({
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
      cachedInputTokens: 1,
    });
  });

  it("returns empty text and undefined usage fields when the response omits them", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );

    const model = createBedrockChatModel({
      modelId: "m",
      region: "us-east-1",
      getCredentials: () => credentials,
    });
    const result = await model.generate(callOptions);

    expect(result.text).toBe("");
    expect(result.usage).toEqual({
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
      cachedInputTokens: undefined,
    });
  });
});
