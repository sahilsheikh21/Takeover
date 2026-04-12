# Phase 4: Telegram Bot Integration - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Telegram bot using node-telegram-bot-api running as separate process for mobile access.

</domain>

<decisions>
## Implementation Decisions

### Mobile Context & Media
- Chat Context Window: Load the entire session history (hits limits fast on 8GB VRAM)
- Media Handling (Voice/Images): Attempt to process via basic Whisper/Vision providers (slow)

</decisions>

<code_context>
## Existing Code Insights
telegram-bot.js and api route are mostly pre-implemented.
</code_context>

<specifics>
## Specific Ideas
None
</specifics>

<deferred>
## Deferred Ideas
None
</deferred>
