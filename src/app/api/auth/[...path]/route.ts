import { getAuth } from "@/lib/auth/neon-auth.server";

let cachedHandlers:
  | ReturnType<ReturnType<typeof getAuth>["handler"]>
  | undefined;

/**
 * `cachedHandlers` + `handlers()` lazily initialize and cache the
 * `getAuth().handler()` result so the auth handler is created once and reused
 * across requests for performance and to avoid repeated initialization.
 */
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

/**
 * Neon Auth API proxy (PUT).
 *
 * @param args - Route handler args.
 * @returns Next.js response.
 */
export async function PUT(
  ...args: Parameters<ReturnType<typeof handlers>["PUT"]>
) {
  return handlers().PUT(...args);
}

/**
 * Neon Auth API proxy (PATCH).
 *
 * @param args - Route handler args.
 * @returns Next.js response.
 */
export async function PATCH(
  ...args: Parameters<ReturnType<typeof handlers>["PATCH"]>
) {
  return handlers().PATCH(...args);
}

/**
 * Neon Auth API proxy (DELETE).
 *
 * @param args - Route handler args.
 * @returns Next.js response.
 */
export async function DELETE(
  ...args: Parameters<ReturnType<typeof handlers>["DELETE"]>
) {
  return handlers().DELETE(...args);
}
