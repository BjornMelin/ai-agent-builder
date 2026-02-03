import "client-only";

import { createAuthClient } from "@neondatabase/auth/next";

/**
 * Neon Auth client singleton (browser-side).
 *
 * Used by `NeonAuthUIProvider` and any Client Components that need auth APIs.
 */
export const authClient = createAuthClient();
