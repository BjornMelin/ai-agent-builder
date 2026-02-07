import type { AgentMode } from "@/lib/ai/agents/agent-mode";

/**
 * Architecture and library-doc mode (Context7-enabled).
 */
export const architectMode: AgentMode = {
  allowedTools: [
    "retrieveProjectChunks",
    "context7.resolve-library-id",
    "context7.query-docs",
  ],
  budgets: { maxStepsPerTurn: 18 },
  defaultModel: "ai-gateway-default",
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
