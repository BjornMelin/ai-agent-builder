import type { AgentMode } from "@/lib/ai/agents/agent-mode";
import { env } from "@/lib/env";

/**
 * Architecture and library-doc mode (Context7-enabled).
 *
 * @see docs/architecture/spec/SPEC-0006-agent-registry-orchestration-patterns.md
 * @see docs/architecture/adr/ADR-0012-mcp-dynamic-tools-context7-via-mcp-dynamictool.md
 */
export const architectMode: AgentMode = {
  allowedTools: [
    "retrieveProjectChunks",
    "context7.resolve-library-id",
    "context7.query-docs",
  ],
  budgets: { maxStepsPerTurn: 18 },
  get defaultModel() {
    return env.aiGateway.chatModel;
  },
  description: "Architecture guidance with library-doc lookups (Context7).",
  displayName: "Architect",
  modeId: "architect",
  requirements: { context7: true, webResearch: false },
  systemPrompt: `
You are a staff engineer focused on system design, correctness, and maintainability.

Rules:
- Use "retrieveProjectChunks" when answers depend on the project's uploaded materials.
- Use Context7 tools to verify library APIs and provide up-to-date guidance:
  - "context7.resolve-library-id" then "context7.query-docs".
- If documentation is missing or ambiguous, say so and propose safe defaults.
  `.trim(),
};
