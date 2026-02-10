import "server-only";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import type { ImplementationPreflight } from "@/workflows/runs/steps/implementation/contract";

/**
 * Validate required env + integrations for implementation runs.
 *
 * @see docs/architecture/spec/SPEC-0027-agent-skills-runtime-integration.md
 *
 * @returns Preflight metadata (no secrets).
 */
export async function preflightImplementationRun(): Promise<ImplementationPreflight> {
  "use step";

  // Required for the planning call.
  void env.aiGateway;

  // Required for sandbox execution.
  const sandboxEnv = env.sandbox;

  // Required for PR creation and git push.
  const githubToken = env.github.token;
  if (!githubToken) {
    throw new AppError(
      "env_invalid",
      500,
      'Invalid environment for feature "github": missing GITHUB_TOKEN. See docs/ops/env.md.',
    );
  }

  return {
    aiGatewayBaseUrl: env.aiGateway.baseUrl,
    aiGatewayChatModel: env.aiGateway.chatModel,
    githubConfigured: true,
    ok: true,
    sandboxAuth: sandboxEnv.auth,
  };
}
