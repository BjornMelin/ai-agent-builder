import "server-only";

import { Client } from "@upstash/qstash";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

import { env } from "@/lib/env";

let cachedQstashClient: Client | undefined;

/**
 * Lazily create and cache a single QStash client.
 *
 * This avoids direct `process.env` access and ensures env validation happens at
 * the first usage site.
 *
 * @returns QStash client for publishing messages.
 */
export function getQstashClient(): Client {
  cachedQstashClient ??= new Client({ token: env.qstashPublish.token });
  return cachedQstashClient;
}

/**
 * Wrap an App Router Route Handler with QStash signature verification.
 *
 * Prefer this wrapper instead of reading `process.env` inside handlers.
 *
 * @param handler - Route handler to verify.
 * @returns Verified handler.
 */
export function verifyQstashSignatureAppRouter(
  handler: Parameters<typeof verifySignatureAppRouter>[0],
): ReturnType<typeof verifySignatureAppRouter> {
  return verifySignatureAppRouter(handler, {
    currentSigningKey: env.qstashVerify.currentSigningKey,
    nextSigningKey: env.qstashVerify.nextSigningKey,
  });
}
