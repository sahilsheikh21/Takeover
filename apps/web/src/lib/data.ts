import fs from 'fs';
import path from 'path';
import type { Settings, SkillState, TelegramConfig } from '@/types';

// ─── Data directory ───────────────────────────────────────────────────────────
export function getDataDir(): string {
  return process.env.TAKEOVER_DATA_DIR || path.join(process.cwd(), '.takeover-data');
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureDataDirs() {
  const dataDir = getDataDir();
  ensureDir(dataDir);
  ensureDir(path.join(dataDir, 'sessions'));
  ensureDir(path.join(dataDir, 'workspace'));
  ensureDir(path.join(dataDir, 'workspace', 'images'));
  ensureDir(path.join(dataDir, 'integrations'));
  ensureDir(path.join(dataDir, 'cron'));
  ensureDir(path.join(dataDir, 'memory'));
}

// ─── Settings ────────────────────────────────────────────────────────────────
function getSettingsFile(): string {
  return path.join(getDataDir(), 'settings.json');
}

const DEFAULT_SETTINGS: Settings = {
  activeProvider: 'ollama',
  providers: {
    ollama: {
      model: process.env.OLLAMA_MODEL || 'qwen2.5:3b-instruct',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    },
  },
  persona: 'default',
  safeMode: false,
  isAutonomousMode: false,
};

export function loadSettings(): Settings {
  try {
    const settingsFile = getSettingsFile();
    if (fs.existsSync(settingsFile)) {
      const raw = fs.readFileSync(settingsFile, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        providers: {
          ...DEFAULT_SETTINGS.providers,
          ...(parsed.providers || {}),
        },
      };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const current = loadSettings();
  const updated: Settings = {
    ...current,
    ...patch,
    providers: {
      ...current.providers,
      ...(patch.providers || {}),
    },
  };

  if (patch.ttsConfig) {
    updated.ttsConfig = {
      ...(current.ttsConfig || {}),
      ...patch.ttsConfig,
    };
  }

  ensureDataDirs();
  fs.writeFileSync(getSettingsFile(), JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

// ─── Skills ──────────────────────────────────────────────────────────────────
function getSkillsFile(): string {
  return path.join(getDataDir(), 'skills.json');
}

const DEFAULT_SKILLS: SkillState = {
  skills: {
    weather:        { id: 'weather',        enabled: true  },
    web_search:     { id: 'web_search',     enabled: false },
    image_gen:      { id: 'image_gen',      enabled: false },
    browser:        { id: 'browser',        enabled: false },
    code_exec:      { id: 'code_exec',      enabled: false },
    email:          { id: 'email',          enabled: false },
    github:         { id: 'github',         enabled: false },
    telegram:       { id: 'telegram',       enabled: false },
  },
};

export function loadSkills(): SkillState {
  try {
    const skillsFile = getSkillsFile();
    if (fs.existsSync(skillsFile)) {
      return JSON.parse(fs.readFileSync(skillsFile, 'utf-8'));
    }
  } catch {}
  return DEFAULT_SKILLS;
}

export function saveSkills(state: SkillState): void {
  ensureDataDirs();
  fs.writeFileSync(getSkillsFile(), JSON.stringify(state, null, 2), 'utf-8');
}

export function toggleSkill(id: string, enabled: boolean): SkillState {
  const state = loadSkills();
  if (!state.skills[id]) state.skills[id] = { id, enabled };
  state.skills[id].enabled = enabled;
  saveSkills(state);
  return state;
}

// ─── Telegram Config ─────────────────────────────────────────────────────────
function getTelegramFile(): string {
  return path.join(getDataDir(), 'integrations', 'telegram.json');
}

export function loadTelegramConfig(): TelegramConfig | null {
  try {
    const telegramFile = getTelegramFile();
    if (fs.existsSync(telegramFile)) {
      return JSON.parse(fs.readFileSync(telegramFile, 'utf-8'));
    }
  } catch {}
  return null;
}

export function saveTelegramConfig(config: TelegramConfig): void {
  ensureDataDirs();
  fs.writeFileSync(getTelegramFile(), JSON.stringify(config, null, 2), 'utf-8');
}

// ─── Session management ──────────────────────────────────────────────────────
import type { Session, Message } from '@/types';
import crypto from 'crypto';

export function getSessionPath(sessionId: string): string {
  return path.join(getDataDir(), 'sessions', `${sessionId}.json`);
}

export function loadSession(sessionId: string): Session | null {
  try {
    const p = getSessionPath(sessionId);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {}
  return null;
}

export function saveSession(session: Session): void {
  ensureDataDirs();
  fs.writeFileSync(getSessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8');
}

export function appendMessage(sessionId: string, message: Message): Session {
  ensureDataDirs();
  let session = loadSession(sessionId);
  if (!session) {
    session = {
      id: sessionId,
      title: message.content.slice(0, 60) || 'New conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  session.messages.push(message);
  session.updatedAt = Date.now();
  saveSession(session);
  return session;
}

export function listSessions(): Session[] {
  try {
    const sessDir = path.join(getDataDir(), 'sessions');
    if (!fs.existsSync(sessDir)) return [];
    return fs
      .readdirSync(sessDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(sessDir, f), 'utf-8')); } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt) as Session[];
  } catch { return []; }
}

export function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}
