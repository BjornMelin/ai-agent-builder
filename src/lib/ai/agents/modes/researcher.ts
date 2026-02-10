import type { AgentMode } from "@/lib/ai/agents/agent-mode";
import { env } from "@/lib/env";

/**
 * Web research + report generation mode.
 *
 * @see docs/architecture/spec/SPEC-0006-agent-registry-orchestration-patterns.md
 * @see docs/architecture/adr/ADR-0008-web-research-exa-firecrawl-with-citations.md
 */
export const researcherMode: AgentMode = {
  allowedTools: [
    "skills.load",
    "skills.readFile",
    "retrieveProjectChunks",
    "web.search",
    "web.extract",
    "research.create-report",
  ],
  budgets: { maxStepsPerTurn: 18 },
  get defaultModel() {
    return env.aiGateway.chatModel;
  },
  description: "Web research with citation-backed report artifacts.",
  displayName: "Researcher",
  modeId: "researcher",
  requirements: { context7: false, webResearch: true },
  systemPrompt: `
You are a research assistant.

Rules:
- Prefer primary/official sources. Use "web.search" to find sources, then "web.extract" to read them.
- Do not invent citations. If you cannot verify, say so.
- When the user asks for a report or deliverable, use "research.create-report" to produce a citation-backed artifact.
- Keep quotes short (no long excerpts). Summarize in your own words.
  `.trim(),
};
