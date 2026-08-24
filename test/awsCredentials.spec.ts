import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  resolveAwsCredentials,
  resolveAwsRegion,
} from "../src/ai/providers/awsCredentials";

const ENV_KEYS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_PROFILE",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_CONFIG_FILE",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
];

describe("resolveAwsCredentials / resolveAwsRegion", () => {
  const originalEnv = process.env;
  let dir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of ENV_KEYS) delete process.env[key];
    dir = mkdtempSync(join(tmpdir(), "smart-diff-aws-"));
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  describe("resolveAwsCredentials", () => {
    it("prefers env-var credentials, trimmed, including a session token", () => {
      process.env.AWS_ACCESS_KEY_ID = "  AKIAENV  ";
      process.env.AWS_SECRET_ACCESS_KEY = "  secret-env  ";
      process.env.AWS_SESSION_TOKEN = "  tok-env  ";
      expect(resolveAwsCredentials()).toEqual({
        accessKeyId: "AKIAENV",
        secretAccessKey: "secret-env",
        sessionToken: "tok-env",
      });
    });

    it("omits sessionToken when unset in env", () => {
      process.env.AWS_ACCESS_KEY_ID = "AKIAENV";
      process.env.AWS_SECRET_ACCESS_KEY = "secret-env";
      expect(resolveAwsCredentials()).toEqual({
        accessKeyId: "AKIAENV",
        secretAccessKey: "secret-env",
        sessionToken: undefined,
      });
    });

    it("returns undefined when no env credentials and no shared file", () => {
      process.env.AWS_SHARED_CREDENTIALS_FILE = join(
        dir,
        "missing-credentials",
      );
      expect(resolveAwsCredentials()).toBeUndefined();
    });

    it("parses the default profile from the shared credentials file, ignoring comments and blank lines", () => {
      const file = join(dir, "credentials");
      writeFileSync(
        file,
        [
          "; a comment",
          "",
          "[default]",
          "aws_access_key_id = AKIADEFAULT",
          "aws_secret_access_key = default-secret",
          "",
          "# another comment",
          "[work]",
          "aws_access_key_id = AKIAWORK",
          "aws_secret_access_key = work-secret",
          "aws_session_token = work-token",
        ].join("\n"),
      );
      process.env.AWS_SHARED_CREDENTIALS_FILE = file;

      expect(resolveAwsCredentials()).toEqual({
        accessKeyId: "AKIADEFAULT",
        secretAccessKey: "default-secret",
        sessionToken: undefined,
      });
    });

    it("parses a named profile selected via AWS_PROFILE", () => {
      const file = join(dir, "credentials");
      writeFileSync(
        file,
        [
          "[default]",
          "aws_access_key_id = AKIADEFAULT",
          "aws_secret_access_key = default-secret",
          "[work]",
          "aws_access_key_id = AKIAWORK",
          "aws_secret_access_key = work-secret",
          "aws_session_token = work-token",
        ].join("\n"),
      );
      process.env.AWS_SHARED_CREDENTIALS_FILE = file;
      process.env.AWS_PROFILE = "work";

      expect(resolveAwsCredentials()).toEqual({
        accessKeyId: "AKIAWORK",
        secretAccessKey: "work-secret",
        sessionToken: "work-token",
      });
    });

    it("returns undefined for a profile missing required keys", () => {
      const file = join(dir, "credentials");
      writeFileSync(file, "[default]\naws_access_key_id = only-id\n");
      process.env.AWS_SHARED_CREDENTIALS_FILE = file;
      expect(resolveAwsCredentials()).toBeUndefined();
    });

    it("returns undefined for a profile that doesn't exist in the file", () => {
      const file = join(dir, "credentials");
      writeFileSync(
        file,
        "[default]\naws_access_key_id = a\naws_secret_access_key = b\n",
      );
      process.env.AWS_SHARED_CREDENTIALS_FILE = file;
      process.env.AWS_PROFILE = "missing";
      expect(resolveAwsCredentials()).toBeUndefined();
    });
  });

  describe("resolveAwsRegion", () => {
    it("prefers AWS_REGION over AWS_DEFAULT_REGION", () => {
      process.env.AWS_REGION = "eu-west-1";
      process.env.AWS_DEFAULT_REGION = "us-west-2";
      expect(resolveAwsRegion()).toBe("eu-west-1");
    });

    it("falls back to AWS_DEFAULT_REGION", () => {
      process.env.AWS_DEFAULT_REGION = "us-west-2";
      expect(resolveAwsRegion()).toBe("us-west-2");
    });

    it("reads the default profile section from the config file", () => {
      const file = join(dir, "config");
      writeFileSync(file, "[default]\nregion = ap-southeast-2\n");
      process.env.AWS_CONFIG_FILE = file;
      expect(resolveAwsRegion()).toBe("ap-southeast-2");
    });

    it("reads a named profile section (prefixed 'profile ') from the config file", () => {
      const file = join(dir, "config");
      writeFileSync(file, "[profile work]\nregion = ap-southeast-2\n");
      process.env.AWS_CONFIG_FILE = file;
      process.env.AWS_PROFILE = "work";
      expect(resolveAwsRegion()).toBe("ap-southeast-2");
    });

    it("falls back to us-east-1 when nothing is configured", () => {
      process.env.AWS_CONFIG_FILE = join(dir, "missing-config");
      expect(resolveAwsRegion()).toBe("us-east-1");
    });
  });
});
