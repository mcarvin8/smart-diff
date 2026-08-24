import { createHash, createHmac } from "node:crypto";

/**
 * Minimal AWS Signature Version 4 signer (header-based, no query-string
 * signing) — just enough to sign a single `POST` request with no query
 * parameters, which is all the Bedrock Converse API needs. Avoids depending
 * on the AWS SDK purely for request signing.
 */

export type SigV4Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export type SignRequestOptions = {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: string;
  region: string;
  service: string;
  credentials: SigV4Credentials;
  /** Injectable for tests; defaults to `new Date()`. */
  date?: Date;
};

/** Returns the full header set (including `authorization`) for the signed request. */
export function signRequest(
  options: SignRequestOptions,
): Record<string, string> {
  const date = options.date ?? new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}Z$/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    ...options.headers,
    host: options.url.host,
    "x-amz-date": amzDate,
  };
  if (options.credentials.sessionToken) {
    headers["x-amz-security-token"] = options.credentials.sessionToken;
  }

  const sortedHeaderKeys = Object.keys(headers).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  const canonicalHeaders = sortedHeaderKeys
    .map((key) => `${key.toLowerCase()}:${headers[key]!.trim()}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys
    .map((key) => key.toLowerCase())
    .join(";");

  const canonicalRequest = [
    options.method,
    options.url.pathname || "/",
    options.url.search.replace(/^\?/, ""),
    canonicalHeaders,
    signedHeaders,
    sha256Hex(options.body),
  ].join("\n");

  const credentialScope = `${dateStamp}/${options.region}/${options.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${options.credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, options.region);
  const kService = hmac(kRegion, options.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${options.credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { ...headers, authorization };
}
