import {
  type ChatModel,
  generateText,
  isRetryableStatus,
  LlmApiError,
} from "../src/ai/llmClient";

describe("isRetryableStatus", () => {
  it("is true for 429", () => {
    expect(isRetryableStatus(429)).toBe(true);
  });

  it("is true for 5xx", () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("is false for other 4xx", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});

describe("generateText", () => {
  const callOptions = {
    system: "s",
    prompt: "p",
    temperature: 0.2,
    maxOutputTokens: 100,
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the result on first success without retrying", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "ok", usage: {} });
    const model: ChatModel = { generate };

    const result = await generateText({ model, ...callOptions, maxRetries: 3 });

    expect(result.text).toBe("ok");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-LlmApiError", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("boom"));
    const model: ChatModel = { generate };

    await expect(
      generateText({ model, ...callOptions, maxRetries: 3 }),
    ).rejects.toThrow("boom");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-retryable LlmApiError", async () => {
    const generate = vi
      .fn()
      .mockRejectedValue(
        new LlmApiError("bad request", { statusCode: 400, retryable: false }),
      );
    const model: ChatModel = { generate };

    await expect(
      generateText({ model, ...callOptions, maxRetries: 3 }),
    ).rejects.toThrow("bad request");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable LlmApiError with backoff, then returns the eventual success", async () => {
    vi.useFakeTimers();
    const generate = vi
      .fn()
      .mockRejectedValueOnce(
        new LlmApiError("rate limited", { statusCode: 429, retryable: true }),
      )
      .mockRejectedValueOnce(
        new LlmApiError("rate limited", { statusCode: 429, retryable: true }),
      )
      .mockResolvedValueOnce({ text: "recovered", usage: {} });
    const model: ChatModel = { generate };

    const promise = generateText({ model, ...callOptions, maxRetries: 3 });
    await vi.advanceTimersByTimeAsync(500); // backoff after attempt 1
    await vi.advanceTimersByTimeAsync(1000); // backoff after attempt 2

    const result = await promise;
    expect(result.text).toBe("recovered");
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("throws the last error once maxRetries is exhausted", async () => {
    vi.useFakeTimers();
    const err = new LlmApiError("still limited", {
      statusCode: 429,
      retryable: true,
    });
    const generate = vi.fn().mockRejectedValue(err);
    const model: ChatModel = { generate };

    const promise = generateText({ model, ...callOptions, maxRetries: 1 });
    const assertion = expect(promise).rejects.toBe(err);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;

    expect(generate).toHaveBeenCalledTimes(2); // initial attempt + 1 retry
  });

  it("does not retry at all when maxRetries is 0", async () => {
    const err = new LlmApiError("limited", {
      statusCode: 429,
      retryable: true,
    });
    const generate = vi.fn().mockRejectedValue(err);
    const model: ChatModel = { generate };

    await expect(
      generateText({ model, ...callOptions, maxRetries: 0 }),
    ).rejects.toBe(err);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
