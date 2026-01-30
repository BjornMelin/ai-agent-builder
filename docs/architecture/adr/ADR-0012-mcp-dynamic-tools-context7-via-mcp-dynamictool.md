---
ADR: 0012
Title: MCP + dynamic tools: Context7 via MCP + dynamicTool
Status: Accepted
Version: 0.2
Date: 2026-01-30
Supersedes: []
Superseded-by: []
Related: [ADR-0006, ADR-0008, ADR-0013]
Tags: [tools, architecture]
References:
  - [MCP tools](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
  - [createMCPClient](https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client)
  - [MCP client guide](https://modelcontextprotocol.io/docs/develop/build-client)
---

## Status

Accepted — 2026-01-30.

## Description

Use MCP to query up-to-date library documentation on demand, injected as dynamic tools.

## Context

Library APIs change quickly. Instead of hardcoding doc content into prompts, we can query official library docs via Context7 MCP tools. Dynamic tool injection prevents bloating the agent context window.

## Decision Drivers

- Up-to-date docs
- Lower context bloat
- Type-safe tools
- On-demand capability

## Alternatives

- A: MCP + dynamicTool — Pros: fresh docs; minimal context. Cons: tool integration.
- B: Static docs snapshot — Pros: simple. Cons: quickly outdated.
- C: Rely on model memory — Pros: no tooling. Cons: unreliable.

### Decision Framework

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.3 | 3.25 |
| Application value | 0.30 | 9.2 | 2.76 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.4 | 0.94 |

**Total:** 9.21 / 10.0

## Decision

We will use **MCP tools** via `createMCPClient` and expose them to agents using `dynamicTool()` so only the required doc tools are in context for a given step.

## Constraints

- Only query necessary docs; cache results.
- Avoid injecting entire docs into prompts.
- Treat doc content as data; still cite sources.

## High-Level Architecture

```mermaid
flowchart LR
  Agent --> Dynamic[dynamicTool()]
  Dynamic --> MCPClient[createMCPClient]
  MCPClient --> Context7[(Context7 MCP server)]
```

## Related Requirements

### Functional Requirements

- **FR-013:** query library docs via MCP.

### Non-Functional Requirements

- **NFR-006:** caching and tool-call limits.

### Performance Requirements

- **PR-001:** keep streaming responsive by deferring deep doc queries.

### Integration Requirements

- **IR-008:** MCP via Context7.

## Design

### Architecture Overview

- MCP client configured as stdio transport.
- Tools: resolve library id, query docs.

### Implementation Details

- Add `src/lib/ai/tools/mcp.ts` that provides a `getMcpTools()` factory.
- Use `dynamicTool()` to inject only when step requires.

## Testing

- Contract: MCP tool returns expected schema.
- Integration: tool caching avoids repeated calls.
- Regression: agents without MCP do not access MCP tools.

## Implementation Notes

- Ensure MCP server credentials are stored server-side only.

## Consequences

### Positive Outcomes

- Docs freshness
- Lower prompt bloat

### Negative Consequences / Trade-offs

- External dependency and potential latency

### Ongoing Maintenance & Considerations

- Monitor MCP server reliability and caching hit rate

### Dependencies

- **Added**: @modelcontextprotocol/sdk, context7 tools
- **Removed**: []

## Changelog

- **0.1 (2026-01-29)**: Initial version.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
