/**
 * A single secret-detection rule applied to unified diff text before it is
 * sent to an LLM. `replacement` follows `String.prototype.replace` semantics:
 * a plain string replaces the whole match; a function receives the match and
 * capture groups and returns the replacement, letting a rule keep context
 * (e.g. a `Bearer ` prefix or a variable name) while redacting only the
 * secret value itself.
 */
export type SecretRedactionRule = {
  /** Identifier for the rule, useful in tests/debugging. */
  name: string;
  /** Must be a global (`g`) regex; `redactSecrets` reuses it across the whole text. */
  pattern: RegExp;
  replacement: string | ((substring: string, ...args: any[]) => string);
};

/**
 * Built-in rules covering common credential shapes: cloud provider keys,
 * VCS/chat platform tokens, PEM private key blocks, JWTs, `Bearer` headers,
 * HTTP basic-auth URL passwords, and generic `KEY=value` / `key: value`
 * assignments for common secret-like variable names.
 *
 * These are heuristics, not a secret scanner — they catch the common cases
 * that show up in accidentally-committed diffs, not every possible credential
 * format.
 */
export const DEFAULT_SECRET_PATTERNS: readonly SecretRedactionRule[] = [
  {
    name: "aws-access-key-id",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: "[REDACTED:aws-access-key-id]",
  },
  {
    name: "private-key-block",
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    replacement: "[REDACTED:private-key]",
  },
  {
    name: "github-token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g,
    replacement: "[REDACTED:github-token]",
  },
  {
    name: "slack-token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,72}\b/g,
    replacement: "[REDACTED:slack-token]",
  },
  {
    name: "google-api-key",
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    replacement: "[REDACTED:google-api-key]",
  },
  {
    name: "stripe-key",
    pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{10,}\b/g,
    replacement: "[REDACTED:stripe-key]",
  },
  {
    name: "jwt",
    pattern:
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: "[REDACTED:jwt]",
  },
  {
    name: "bearer-header",
    pattern: /\b(Bearer\s+)([A-Za-z0-9\-_.=]{10,})/gi,
    replacement: (_match: string, prefix: string) =>
      `${prefix}[REDACTED:bearer-token]`,
  },
  {
    name: "basic-auth-url",
    pattern: /(:\/\/[^/\s:@]+:)([^@/\s]+)(@)/g,
    replacement: (
      _match: string,
      prefix: string,
      _password: string,
      at: string,
    ) => `${prefix}[REDACTED:password]${at}`,
  },
  {
    name: "labeled-secret-assignment",
    pattern:
      /((?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|private[_-]?key|client[_-]?secret)\s*[:=]\s*)(['"]?)([A-Za-z0-9\-_./+=]{8,})(\2)/gi,
    replacement: (
      _match: string,
      prefix: string,
      quote: string,
      _value: string,
      closeQuote: string,
    ) => `${prefix}${quote}[REDACTED]${closeQuote}`,
  },
];

/**
 * Redact likely secrets/credentials from diff text using the given rules
 * (defaults to {@link DEFAULT_SECRET_PATTERNS}). Applied before the diff is
 * sent to an LLM so accidentally-committed credentials aren't forwarded to a
 * third-party provider.
 */
export function redactSecrets(
  text: string,
  patterns: readonly SecretRedactionRule[] = DEFAULT_SECRET_PATTERNS,
): string {
  let out = text;
  for (const rule of patterns) {
    out =
      typeof rule.replacement === "string"
        ? out.replace(rule.pattern, rule.replacement)
        : out.replace(rule.pattern, rule.replacement);
  }
  return out;
}
