# Takeover — Roadmap

## Milestone 1: Core Agent Desktop App + Telegram Bot

---

### Phase 1: Project Scaffold & Electron Shell
**Goal:** Electron app launches, loads Next.js dev server, shows splash, has system tray. Repo structure ready for all future phases.

**Plans:**
- `1.1` Root monorepo setup (package.json, electron-builder.yml, .gitignore, GEMINI.md)
- `1.2` Electron main process (main.js, preload.js, tray.js, splash.html)
- `1.3` Next.js 14 app scaffold (apps/web with TypeScript, TailwindCSS, App Router)

**UAT:**
- `npm run dev` from root starts Electron + Next.js
- Electron window loads http://localhost:3000
- Splash screen appears on startup
- System tray icon visible

---

### Phase 2: AI Agent Brain — Multi-Provider LLM
**Goal:** Working AI chat API that routes to Ollama (primary) + other providers. Multi-step agent loop with tool system.

**Depends on:** Phase 1

**Plans:**
- `2.1` Provider routing layer (providers.ts — Ollama, OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, OpenRouter)
- `2.2` Agent brain (agent.ts — multi-step loop, tool calling, streaming)
- `2.3` Tool system (tools.ts — read_file, write_file, list_dir, run_command, web_search, screenshot)
- `2.4` Chat API route (/api/chat/route.ts — streaming SSE endpoint)
- `2.5` Settings persistence (settings.json read/write, /api/settings route)

**UAT:**
- POST /api/chat streams response from Ollama qwen2.5:3b-instruct
- Agent can invoke tools (read a file, list directory)
- Settings saved/loaded from ~/.takeover-data/settings.json

---

### Phase 3: Dashboard UI
**Goal:** Beautiful, functional web dashboard with chat, settings, and skills pages.

**Depends on:** Phase 2

**Plans:**
- `3.1` Design system (globals.css, TailwindCSS config, fonts, color tokens)
- `3.2` Layout + Sidebar (root layout, sidebar nav, routing)
- `3.3` Chat page (streaming chat UI with markdown, code highlighting, tool call display)
- `3.4` Settings page (provider selector, API key inputs, Ollama URL config, persona picker)
- `3.5` Skills page (toggleable skill grid)

**UAT:**
- Chat page renders, user can type and get streaming AI response
- Settings page saves provider/key, persists on reload
- Skills grid shows all built-in skills with toggle buttons
- Dark theme, premium aesthetics

---

### Phase 4: Telegram Bot Integration
**Goal:** Full Telegram bot with voice, photo, file, and admin keyboard support.

**Depends on:** Phase 2

**Plans:**
- `4.1` telegram-bot.js (polling bot, pairing, text chat → agent brain)
- `4.2` Voice support (STT: Whisper/Groq → agent → TTS voice reply)
- `4.3` Photo + document handling (vision, PDF, text files)
- `4.4` Admin menus (inline keyboard: /settings, /skills, /tasks, /autopilot, /jobs)
- `4.5` Scheduler (cron jobs firing via agent, results to Telegram)
- `4.6` Telegram API routes + dashboard bridge (inbox, appearance in chat UI)
- `4.7` Telegram settings UI (pairing UI + QR code in dashboard)

**UAT:**
- /pair connects bot to user
- Text message → agent response via Telegram
- Voice note → transcribed → agent → voice reply
- Photo → vision analysis → Telegram reply
- /settings shows inline keyboard with provider/persona
- Scheduled job fires and sends result to Telegram

---

### Phase 5: Skills System
**Goal:** Modular skill capabilities that enable/disable tools.

**Depends on:** Phase 3

**Plans:**
- `5.1` Skills engine (skills.ts — registry, toggle, persistence)
- `5.2` Web search skill (Brave/Tavily/Google fallback)
- `5.3` Image generation skill (DALL-E / Replicate)
- `5.4` Browser control skill (Playwright headless agent)
- `5.5` Email skill (nodemailer + IMAP)
- `5.6` Code execution skill (sandboxed child_process)

**UAT:**
- Toggling skill in settings enables/disables its tools in agent
- Web search returns results in chat
- Image generation produces image, displays in chat

---

### Phase 6: Autonomous Coding + Advanced Features
**Goal:** Codework IDE, desktop automation, background task queue.

**Depends on:** Phase 4, Phase 5

**Plans:**
- `6.1` Background task queue + autopilot agent loop
- `6.2` Codework page (3-panel: file tree, diff view, terminal output)
- `6.3` Desktop computer use (screenshot + mouse/keyboard via @nut-tree/nut-js)
- `6.4` Export/backup system (ZIP ~/.takeover-data/, restore)
- `6.5` Desktop Buddy window (floating mascot)

**UAT:**
- Give Codework a task, agent writes/edits files with live diffs
- Autopilot processes tasks from queue
- Export creates downloadable ZIP

---

## Backlog (999.x)
- 999.1 Multi-agent teams ("Organization") with department routing
- 999.2 macOS / Linux builds
- 999.3 Discord integration
- 999.4 WhatsApp integration
- 999.5 Video generation skill
- 999.6 Google Calendar skill
- 999.7 GitHub skill
