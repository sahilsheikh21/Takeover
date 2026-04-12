# Phase 2: AI Agent Brain — Multi-Provider LLM - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Working AI chat API that routes to Ollama (primary) + other providers. Multi-step agent loop with tool system.

</domain>

<decisions>
## Implementation Decisions

### Provider & Timeout Policies
- Ollama Unreachable Behavior: Return graphical error in chat asking user to start it.
- Step Timeout Limit: 60s per generation step

### Tool System Execution
- Dangerous Tools (like `run_command`): Always prompt user before running commands
- Max Tool Loop Steps: 10 steps (slower but deeper automation)

### the agent's Discretion
None

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agent.ts` and `providers.ts` existing scaffolds have basic LLM routing.

### Established Patterns
- LLM abstraction and tool definitions via functional TS.
- Agent non-streaming and streaming interfaces.

### Integration Points
- API routes in `/api/chat` and `/api/settings` to expose brains.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
