# Takeover

Local-first AI desktop agent built with Electron + Next.js.

Takeover runs on your machine, stores app state locally, and lets you use your own model providers. It includes a desktop dashboard, multi-provider chat, a task workflow, a built-in skills/tooling system, and Telegram integration for remote control.

## Highlights

- Local data storage under `.takeover-data` (or `TAKEOVER_DATA_DIR` override)
- BYOK provider setup with support for multiple LLM providers
- Dashboard modules: Chat, Planner, Codework, Browser, Skills, Studio, Settings
- Telegram bot pairing for mobile-first interaction
- Session persistence and file/workspace utilities
- Electron tray integration and custom splash screen

## Tech Stack

- Electron 28
- Next.js 14 App Router
- React 18 + TypeScript
- TailwindCSS

## Monorepo Layout

```text
.
├── electron/
│   ├── main.js
│   ├── preload.js
│   ├── splash.html
│   ├── tray.js
│   └── icons/
├── apps/web/
│   ├── src/
│   │   ├── app/                 # dashboard pages + API routes
│   │   ├── components/          # UI building blocks
│   │   ├── lib/                 # providers, tools, data, SSE helpers
│   │   └── types/
│   ├── public/
│   └── telegram-bot.js
├── electron-builder.yml
└── package.json
```

## Prerequisites

- Node.js 18+ (recommended: latest LTS)
- npm
- Optional: Ollama for local inference

## Quick Start (Development)

```bash
# 1) install root dependencies
npm install

# 2) install web app dependencies
cd apps/web
npm install
cd ../..

# 3) run desktop app (Electron launches the web server internally)
npm run dev
```

The app will auto-select an available local port from `3000-3005`.

## Scripts

Root scripts:

- `npm run dev` - launch Electron app in development
- `npm run dev:web` - run Next.js dev server only
- `npm run dev:electron` - run Electron only
- `npm run build:web` - build Next.js app
- `npm run build:win` - build web + package Windows app
- `npm run build:mac` - build web + package macOS app
- `npm run build:linux` - build web + package Linux app
- `npm run start` - launch Electron app

Web app scripts (inside `apps/web`):

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## Provider Configuration

Configure providers from the Settings page in-app.

Supported provider IDs in code include:

- `ollama`
- `openai`
- `anthropic`
- `google`
- `groq`
- `openrouter`
- `mistral`
- `deepseek`
- `xai`
- `fireworks`
- `together`
- `cohere`
- `perplexity`
- `lmstudio`
- `custom`

Default local setup uses Ollama:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b-instruct
```

## Telegram Setup

1. Create a bot with `@BotFather` and copy your token.
2. Open Takeover -> Settings -> Telegram.
3. Enable Telegram and paste the bot token.
4. Generate (or set) a pairing code and save settings.
5. Restart the desktop app.
6. In Telegram, send `/start` to your bot and pair using `/pair <CODE>`.

Telegram config is stored locally at:

- `.takeover-data/integrations/telegram.json`

## Local Data Storage

Default directory:

- `~/.takeover-data` (desktop runtime)

Common files/directories:

- `settings.json` - app/provider settings
- `sessions/` - conversation history JSON files
- `workspace/` - generated files and outputs
- `workspace/images/` - generated image artifacts
- `integrations/telegram.json` - Telegram integration config
- `cron/` - scheduled job metadata
- `memory/` - memory artifacts

You can override the location with:

- `TAKEOVER_DATA_DIR=/custom/path`

## Build and Packaging

Platform packaging is configured through `electron-builder.yml`.

Examples:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

Build output is generated into:

- `dist/`

## Security Notes

- API keys are user-provided through Settings and stored in local app data.
- No hardcoded provider secrets should be committed to the repository.
- Before pushing, run a credential scan and verify `.gitignore` rules for local artifacts.

## Troubleshooting

1. App does not open: ensure no duplicate instance is already running and local ports `3000-3005` are not all occupied.
2. Provider errors: verify API key/model in Settings and confirm internet connectivity for hosted providers.
3. Telegram bot does not respond: verify token and enabled flag, restart after Telegram settings changes, then re-pair with a fresh code.

## License

No license file is currently declared in this repository.
