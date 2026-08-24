import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { SigV4Credentials } from "./sigv4.js";

/**
 * Minimal, in-house substitute for the AWS SDK's credential-provider chain:
 * static env-var credentials, or a profile from the shared `~/.aws/credentials`
 * file. Deliberately does not support SSO, instance-metadata, container, or
 * web-identity credentials — those require talking to AWS SSO/STS/IMDS
 * endpoints, which is out of scope for smart-diff's optional Bedrock support.
 */

type IniSections = Record<string, Record<string, string>>;

function parseIni(content: string): IniSections {
  const sections: IniSections = {};
  let current: string | undefined;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sectionMatch = /^\[(.+)]$/.exec(line);
    if (sectionMatch) {
      current = sectionMatch[1]!.trim();
      sections[current] ??= {};
      continue;
    }
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (kv && current) {
      sections[current]![kv[1]!.trim()] = kv[2]!.trim();
    }
  }
  return sections;
}

function readIniFile(path: string): IniSections {
  try {
    return parseIni(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function resolveProfile(): string {
  return process.env.AWS_PROFILE?.trim() || "default";
}

/** Static credentials from env vars, falling back to a `~/.aws/credentials` profile. */
export function resolveAwsCredentials(): SigV4Credentials | undefined {
  const envAccessKey = process.env.AWS_ACCESS_KEY_ID?.trim();
  const envSecretKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (envAccessKey && envSecretKey) {
    return {
      accessKeyId: envAccessKey,
      secretAccessKey: envSecretKey,
      sessionToken: process.env.AWS_SESSION_TOKEN?.trim() || undefined,
    };
  }

  const credentialsFile =
    process.env.AWS_SHARED_CREDENTIALS_FILE?.trim() ||
    join(homedir(), ".aws", "credentials");
  const section = readIniFile(credentialsFile)[resolveProfile()];
  if (!section?.aws_access_key_id || !section.aws_secret_access_key) {
    return undefined;
  }

  return {
    accessKeyId: section.aws_access_key_id,
    secretAccessKey: section.aws_secret_access_key,
    sessionToken: section.aws_session_token || undefined,
  };
}

/** `AWS_REGION`/`AWS_DEFAULT_REGION`, falling back to `~/.aws/config`, then `us-east-1`. */
export function resolveAwsRegion(): string {
  const envRegion =
    process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim();
  if (envRegion) return envRegion;

  const profile = resolveProfile();
  const configFile =
    process.env.AWS_CONFIG_FILE?.trim() || join(homedir(), ".aws", "config");
  const sections = readIniFile(configFile);
  const sectionKey = profile === "default" ? "default" : `profile ${profile}`;
  return sections[sectionKey]?.region || "us-east-1";
}
