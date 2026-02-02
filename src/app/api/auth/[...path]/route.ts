import { getAuth } from "@/lib/auth/neon-auth.server";

let cachedHandlers:
  | ReturnType<ReturnType<typeof getAuth>["handler"]>
  | undefined;

function handlers() {
  cachedHandlers ??= getAuth().handler();
  return cachedHandlers;
}

/**
 * Neon Auth API proxy (GET).
 *
 * @param args - Route handler args.
 * @returns Next.js response.
 */
export async function GET(
  ...args: Parameters<ReturnType<typeof handlers>["GET"]>
) {
  return handlers().GET(...args);
}

/**
 * Neon Auth API proxy (POST).
 *
 * @param args - Route handler args.
 * @returns Next.js response.
 */
export async function POST(
  ...args: Parameters<ReturnType<typeof handlers>["POST"]>
) {
  return handlers().POST(...args);
}
