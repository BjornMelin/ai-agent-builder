import "server-only";

import { getVercelSandbox } from "@/lib/sandbox/sandbox-client.server";

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

  const sandbox = await getVercelSandbox(sandboxId).catch(() => null);
  if (!sandbox) return;
  try {
    await sandbox.stop();
  } catch {
    // Best effort: sandbox may have already timed out or been stopped elsewhere.
  }
}
