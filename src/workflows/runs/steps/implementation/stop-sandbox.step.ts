import "server-only";

import { stopOwnedSandboxById } from "@/lib/sandbox/sandbox-cancellation.server";

/**
 * Stop a sandbox after implementation steps complete.
 *
 * @see docs/architecture/spec/SPEC-0027-agent-skills-runtime-integration.md
 *
 * @param sandboxId - Sandbox ID.
 */
export async function stopImplementationSandbox(
  sandboxId: string,
): Promise<void> {
  "use step";

  await stopOwnedSandboxById(sandboxId);
}
