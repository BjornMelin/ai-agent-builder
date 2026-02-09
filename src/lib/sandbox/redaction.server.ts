import "server-only";

import { env } from "@/lib/env";

const URL_BASIC_AUTH_PATTERN = /(https?:\/\/[^\s]+?:)[^@\s]+(@)/g;
const AUTHORIZATION_BEARER_PATTERN =
  /(Authorization:\s*Bearer\s+)[A-Za-z0-9._-]+/gi;
const BEARER_PATTERN = /(Bearer\s+)[A-Za-z0-9._-]+/gi;
const GH_PAT_PATTERN = /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g;
const GITHUB_FINE_GRAINED_PATTERN = /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g;
const VERCEL_TOKEN_PATTERN = /\b(vercel)[A-Za-z0-9_-]{20,}\b/gi;

let cachedEnvSecretValues: readonly string[] | null = null;

function collectEnvSecretValues(): string[] {
  const values: string[] = [];

  const pushIf = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed.length < 12) return;
    values.push(trimmed);
  };

  try {
    pushIf(env.github.token);
  } catch {
    // ignore
  }
  try {
    pushIf(env.github.webhookSecret);
  } catch {
    // ignore
  }
  try {
    const sbx = env.sandbox;
    if (sbx.auth === "oidc") pushIf(sbx.oidcToken);
    if (sbx.auth === "token") pushIf(sbx.token);
  } catch {
    // ignore
  }
  try {
    pushIf(env.vercelApi.token);
  } catch {
    // ignore
  }
  try {
    pushIf(env.blob.readWriteToken);
  } catch {
    // ignore
  }
  try {
    pushIf(env.aiGateway.apiKey);
  } catch {
    // ignore
  }
  try {
    pushIf(env.neonApi.apiKey);
  } catch {
    // ignore
  }
  try {
    pushIf(env.vercelWebhooks.secret);
  } catch {
    // ignore
  }
  try {
    pushIf(env.upstashDeveloper.apiKey);
  } catch {
    // ignore
  }

  return values;
}

function getEnvSecretValues(): readonly string[] {
  if (cachedEnvSecretValues) return cachedEnvSecretValues;
  cachedEnvSecretValues = collectEnvSecretValues();
  return cachedEnvSecretValues;
}

/**
 * Redact secret-like values from a string before persisting or displaying it.
 *
 * @param input - Raw log text.
 * @param options - Optional redaction settings.
 * @returns Redacted log text.
 */
export function redactSandboxLog(
  input: string,
  options: Readonly<{ extraSecrets?: readonly string[] }> = {},
): string {
  let out = input;

  out = out.replace(URL_BASIC_AUTH_PATTERN, "$1<redacted>$2");
  out = out.replace(AUTHORIZATION_BEARER_PATTERN, "$1<redacted>");
  out = out.replace(BEARER_PATTERN, "$1<redacted>");
  out = out.replace(GH_PAT_PATTERN, "<redacted>");
  out = out.replace(GITHUB_FINE_GRAINED_PATTERN, "<redacted>");
  out = out.replace(VERCEL_TOKEN_PATTERN, "<redacted>");

  for (const secret of getEnvSecretValues()) {
    out = out.split(secret).join("<redacted>");
  }

  for (const secret of options.extraSecrets ?? []) {
    if (typeof secret !== "string") continue;
    const trimmed = secret.trim();
    if (trimmed.length < 12) continue;
    out = out.split(trimmed).join("<redacted>");
  }

  return out;
}
