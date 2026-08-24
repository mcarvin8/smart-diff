import {
  type SignRequestOptions,
  signRequest,
} from "../src/ai/providers/sigv4";

const base: SignRequestOptions = {
  method: "POST",
  url: new URL(
    "https://bedrock-runtime.us-east-1.amazonaws.com/model/m/converse",
  ),
  headers: { "content-type": "application/json" },
  body: "{}",
  region: "us-east-1",
  service: "bedrock",
  credentials: { accessKeyId: "AKIA", secretAccessKey: "secret" },
  date: new Date("2024-01-01T00:00:00Z"),
};

describe("signRequest", () => {
  it("signs without a session token", () => {
    const headers = signRequest(base);
    expect(headers["x-amz-security-token"]).toBeUndefined();
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIA\/20240101\/us-east-1\/bedrock\/aws4_request, SignedHeaders=.+, Signature=[0-9a-f]{64}$/,
    );
  });

  it("includes x-amz-security-token when a session token is set", () => {
    const headers = signRequest({
      ...base,
      credentials: { ...base.credentials, sessionToken: "session-tok" },
    });
    expect(headers["x-amz-security-token"]).toBe("session-tok");
    expect(headers.authorization).toContain("x-amz-security-token");
  });

  it("produces a deterministic signature for identical fixed inputs", () => {
    const first = signRequest(base);
    const second = signRequest(base);
    expect(first.authorization).toBe(second.authorization);
  });

  it("changes the signature when the body changes", () => {
    const first = signRequest(base);
    const second = signRequest({ ...base, body: '{"changed":true}' });
    expect(first.authorization).not.toBe(second.authorization);
  });
});
