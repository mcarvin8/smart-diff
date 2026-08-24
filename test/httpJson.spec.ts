import { LlmApiError } from "../src/ai/llmClient";
import { postJson } from "../src/ai/providers/httpJson";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postJson", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        ),
    );

    const data = await postJson(
      "https://example.test/x",
      { a: 1 },
      { "x-h": "1" },
      "Test",
    );
    expect(data).toEqual({ ok: true });
  });

  it("wraps a network failure in a retryable LlmApiError", async () => {
    const cause = new Error("ECONNRESET");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));

    await expect(
      postJson("https://example.test/x", {}, {}, "Test"),
    ).rejects.toMatchObject({
      retryable: true,
      cause,
    });
  });

  it("wraps a 5xx response as retryable, including the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("server exploded", { status: 503 })),
    );

    await expect(
      postJson("https://example.test/x", {}, {}, "Test"),
    ).rejects.toMatchObject({
      statusCode: 503,
      retryable: true,
      message: expect.stringContaining("server exploded"),
    });
  });

  it("wraps a 4xx response other than 429 as non-retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })),
    );

    await expect(
      postJson("https://example.test/x", {}, {}, "Test"),
    ).rejects.toMatchObject({
      statusCode: 400,
      retryable: false,
    });
  });

  it("treats 429 as retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("slow down", { status: 429 })),
    );

    await expect(
      postJson("https://example.test/x", {}, {}, "Test"),
    ).rejects.toMatchObject({ statusCode: 429, retryable: true });
  });

  it("falls back to an empty body when reading the error body itself fails", async () => {
    const response = new Response("", { status: 500 });
    vi.spyOn(response, "text").mockRejectedValue(new Error("already read"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const error = await postJson(
      "https://example.test/x",
      {},
      {},
      "Test",
    ).catch((e: unknown) => e as LlmApiError);

    expect(error).toBeInstanceOf(LlmApiError);
    expect((error as LlmApiError).message).toBe(
      "Test request failed with status 500: ",
    );
  });
});
