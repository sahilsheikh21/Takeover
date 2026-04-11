# Takeover — Local AI Desktop Agent

## What This Is

**Takeover** is a local AI Desktop Agent for Windows (expandable to macOS/Linux), built as an Electron application wrapping a Next.js 14 web dashboard. Users bring their own API keys (BYOK) and connect to 15+ AI providers to get a powerful personal AI that can chat, code autonomously, control the desktop, browse the web, schedule tasks, and be controlled entirely through Telegram.

The key differentiator: **Telegram as a first-class interface** — bidirectional voice notes, file sharing, image delivery, screenshot delivery, and full agent control via a Telegram chat.

## Core Value

Give power users a self-hosted, no-subscription AI desktop agent that they control completely — with Telegram as a mobile-native remote control.

## Target User

- Developers and power users who want full control over their AI
- People who already use Telegram and want AI accessible from their phone
- Users frustrated by subscription AI tools who want BYOK with local data storage

## Context

- **Stack:** Electron 28 + Next.js 14 (App Router, standalone) + React 18 + TypeScript + TailwindCSS
- **AI:** Direct API calls to providers — OpenRouter, OpenAI, Anthropic, Google Gemini, Groq, Mistral, DeepSeek, Ollama, xAI, Fireworks, Together, Cohere, Perplexity, LM Studio, custom endpoints
- **Voice:** STT via OpenAI Whisper / Groq Whisper; TTS via ElevenLabs / Azure / Groq PlayAI / Google Translate (free fallback)
- **Telegram:** `node-telegram-bot-api` polling mode, spawned as child process
- **Data:** All local at `~/.takeover-data/` — JSON files, no cloud, no Docker
- **Browser agent:** Playwright (optional dependency)
- **Builder:** electron-builder (NSIS installer for Windows)
- **Primary test model:** Ollama `qwen2.5:3b-instruct` (locally installed)

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Phase 1 — Foundation:**
- [ ] Electron shell launches and shows splash screen
- [ ] Next.js 14 dev server starts embedded, Electron loads it
- [ ] System tray with show/hide/quit
- [ ] Single-instance lock
- [ ] Data directory at `~/.takeover-data/`
- [ ] `GEMINI.md` project instruction file at root

**Phase 2 — Agent Brain:**
- [ ] Multi-provider LLM routing (Ollama first, then OpenAI, Anthropic, Google, Groq, etc.)
- [ ] Stream AI responses
- [ ] Tool system: read_file, write_file, list_dir, run_command, web_search, screenshot
- [ ] Multi-step agent loop (plan → execute → observe → respond)
- [ ] Conversation history with context management
- [ ] Persona system

**Phase 3 — Dashboard UI:**
- [ ] Chat page with streaming markdown responses
- [ ] Settings page (provider config, API keys, Ollama URL)
- [ ] Skills toggle page
- [ ] Sidebar navigation
- [ ] Dark theme with premium aesthetics

**Phase 4 — Telegram Bot:**
- [ ] Pairing code auth
- [ ] Text chat → full agent brain
- [ ] Voice messages → STT → agent → TTS voice reply
- [ ] Photo analysis → vision model → response
- [ ] Document processing (PDF, text, code)
- [ ] File delivery (images, exports) to Telegram
- [ ] Inline keyboard admin: /settings, /skills, /tasks, /jobs, /autopilot
- [ ] Cron scheduler with Telegram notifications
- [ ] Screenshot delivery on request
- [ ] Live task progress updates

**Phase 5 — Skills:**
- [ ] Image generation (DALL-E / Replicate / local SD)
- [ ] Browser control (Playwright)
- [ ] Code execution (sandboxed)
- [ ] Email (SMTP/IMAP)
- [ ] Web search
- [ ] Weather (always on)
- [ ] GitHub integration
- [ ] Google Calendar

**Phase 6 — Advanced:**
- [ ] Autonomous coding ("Codework") — 3-panel IDE
- [ ] Desktop computer use (screenshot + mouse/keyboard)
- [ ] Background task queue with autopilot
- [ ] Multi-agent teams ("Organization")
- [ ] Backup/export system

### Out of Scope (V1)

- WhatsApp integration — requires chromium headless, adds complexity
- Discord integration — defer to V2
- Video generation — defer to V2
- macOS/Linux builds — Windows first
- Multi-user / server mode — local single-user only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Electron + Next.js (not Tauri + SvelteKit) | Mirrors Skales; Node.js ecosystem needed for Telegram bot, file ops; hot reload DX | — Pending |
| Local JSON storage (not SQLite) | Simpler, human-readable, portable, easy backup | — Pending |
| Ollama as first-class provider | Free local inference, privacy, no API key needed | — Pending |
| Telegram polling (not webhook) | Local app, no public URL; polling works fine | — Pending |
| TailwindCSS (not plain CSS) | Team velocity for complex dashboard UI | — Pending |
| All AI calls direct (no SDK abstraction) | Provider-specific features accessible; no vendor lock-in | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions

---
*Last updated: 2026-04-11 after initialization*
