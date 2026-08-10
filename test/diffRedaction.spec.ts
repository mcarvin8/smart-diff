import { DEFAULT_SECRET_PATTERNS, redactSecrets } from "../src/git/index";

describe("redactSecrets", () => {
  it("returns text unchanged when no patterns match", () => {
    const text = "+  const result = a + b;";
    expect(redactSecrets(text)).toBe(text);
  });

  it("redacts an AWS access key id", () => {
    const key = "AKIA" + "ABCDEFGHIJKLMNOP";
    const out = redactSecrets(`+  key = ${key}`);
    expect(out).toContain("[REDACTED:aws-access-key-id]");
    expect(out).not.toContain(key);
  });

  it("redacts a PEM private key block", () => {
    const begin = "-----BEGIN " + "RSA PRIVATE KEY-----";
    const end = "-----END " + "RSA PRIVATE KEY-----";
    const body = "MIIEowIBAAKCAQEA" + "1234567890abcdef";
    const block = [`+${begin}`, `+${body}`, `+${end}`].join("\n");
    const out = redactSecrets(block);
    expect(out).toContain("[REDACTED:private-key]");
    expect(out).not.toContain(body);
  });

  it("redacts a GitHub personal access token", () => {
    const out = redactSecrets(`+GITHUB_TOKEN=ghp_${"a".repeat(36)}`);
    expect(out).toContain("[REDACTED:github-token]");
    expect(out).not.toMatch(/ghp_[a-zA-Z0-9]{36}/);
  });

  it("redacts a Slack token", () => {
    const out = redactSecrets("+slack: xoxb-FAKETESTTOKEN-notreal-value");
    expect(out).toContain("[REDACTED:slack-token]");
  });

  it("redacts a Google API key", () => {
    const out = redactSecrets(`+key = AIza${"a".repeat(35)}`);
    expect(out).toContain("[REDACTED:google-api-key]");
  });

  it("redacts a Stripe secret key", () => {
    const out = redactSecrets(`+STRIPE_KEY=sk_live_${"a".repeat(24)}`);
    expect(out).toContain("[REDACTED:stripe-key]");
  });

  it("redacts a JWT", () => {
    const jwtHeader = "eyJhbGciOiJIUzI1NiJ9";
    const jwtPayload = "eyJzdWIiOiIxMjM0NTY3ODkwIn0";
    const jwtSignature = "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const jwt = `${jwtHeader}.${jwtPayload}.${jwtSignature}`;
    const out = redactSecrets(`+Authorization: Bearer-like ${jwt}`);
    expect(out).toContain("[REDACTED:jwt]");
    expect(out).not.toContain(jwt);
  });

  it("redacts a Bearer token while keeping the prefix", () => {
    const out = redactSecrets("+Authorization: Bearer abcdef1234567890");
    expect(out).toContain("Bearer [REDACTED:bearer-token]");
    expect(out).not.toContain("abcdef1234567890");
  });

  it("redacts a basic-auth URL password while keeping user and host", () => {
    const out = redactSecrets(
      "+url = https://user:hunter2pass@example.com/repo.git",
    );
    expect(out).toContain("https://user:[REDACTED:password]@example.com");
    expect(out).not.toContain("hunter2pass");
  });

  it("redacts a labeled secret assignment (api_key = '...')", () => {
    const out = redactSecrets(`+api_key = "abcdef1234567890"`);
    expect(out).toContain('api_key = "[REDACTED]"');
    expect(out).not.toContain("abcdef1234567890");
  });

  it("redacts a labeled secret assignment with colon syntax and no quotes", () => {
    const out = redactSecrets("+password: superSecretValue123");
    expect(out).toContain("password: [REDACTED]");
    expect(out).not.toContain("superSecretValue123");
  });

  it("does not redact short, non-secret-shaped values", () => {
    const text = "+const enabled = true;";
    expect(redactSecrets(text)).toBe(text);
  });

  it("applies a custom rule set instead of the defaults", () => {
    const out = redactSecrets("+token=abcdef1234567890", [
      { name: "no-op", pattern: /nonexistent/g, replacement: "x" },
    ]);
    expect(out).toContain("abcdef1234567890");
  });

  it("exposes DEFAULT_SECRET_PATTERNS with unique rule names", () => {
    const names = DEFAULT_SECRET_PATTERNS.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThan(0);
  });
});
