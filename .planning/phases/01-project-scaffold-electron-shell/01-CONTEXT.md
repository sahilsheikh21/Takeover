# Phase 1: Project Scaffold & Electron Shell - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Electron app launches, loads Next.js dev server, shows splash, has system tray. Repo structure ready for all future phases.

</domain>

<decisions>
## Implementation Decisions

### Electron Shell & Tray
- Splash Screen UI: Minimal HTML page with "Takeover" text and loading spinner.
- System Tray Menu: "Show App", "Settings", "Quit"
- Close Button Behavior: Quit app entirely

### Main Window & Startup
- Window Dimensions: 1200x800 (Centered)
- Startup Visibility: Start windowed & focused after splash screen

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- None (initial scaffold phase)

### Established Patterns
- Electron + Next.js App Router
- TailwindCSS for styling

### Integration Points
- package.json to manage electron and Next.js processes

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
