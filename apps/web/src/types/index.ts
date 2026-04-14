// Core message types
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  imageDataUri?: string;
  isStreaming?: boolean;
  source?: 'dashboard' | 'telegram';
  telegramChatId?: string;
  telegramUserName?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status?: 'pending' | 'approved' | 'denied' | 'running' | 'done' | 'error';
  result?: string;
}

export interface ToolResult {
  toolCallId: string;
  result: string;
  isError?: boolean;
}

// Provider and settings types
export type ProviderName =
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'groq'
  | 'openrouter'
  | 'mistral'
  | 'deepseek'
  | 'xai'
  | 'fireworks'
  | 'together'
  | 'cohere'
  | 'perplexity'
  | 'lmstudio'
  | 'custom';

export interface ProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export type PersonaName = 'default' | 'coder' | 'entrepreneur' | 'family' | 'student';

export interface TTSConfig {
  provider?: 'default' | 'elevenlabs' | 'azure';
  elevenlabsApiKey?: string;
  elevenlabsVoiceId?: string;
  azureSpeechKey?: string;
  azureSpeechRegion?: string;
  azureVoiceName?: string;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string;
  cwd?: string;
  enabled: boolean;
  env?: Record<string, string>;
}

export interface Settings {
  activeProvider: ProviderName;
  providers: Partial<Record<ProviderName, ProviderConfig>>;
  persona: PersonaName;
  safeMode: boolean;
  isAutonomousMode: boolean;
  ttsConfig?: TTSConfig;
  mcpServers?: MCPServerConfig[];
  nativeLanguage?: string;
  desktopBuddy?: boolean;
  telemetry_enabled?: boolean;
  // Telegram
  telegramEnabled?: boolean;
}

// Skill types
export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  builtin?: boolean;
}

export interface SkillState {
  skills: Record<string, { id: string; enabled: boolean }>;
}

// Task types
export type TaskState = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  description?: string;
  state: TaskState;
  createdAt: number;
  updatedAt?: number;
  result?: string;
  error?: string;
  blockedReason?: string;
}

// Chat API types
export interface ChatRequest {
  message: string;
  sessionId?: string;
  imageDataUri?: string;
  telegramChatId?: string;
  telegramUserName?: string;
}

export interface ChatResponse {
  success: boolean;
  response?: string;
  error?: string;
  requiresApproval?: boolean;
  approvalId?: string;
  pendingApprovals?: ApprovalRequest[];
  generatedMedia?: GeneratedMedia[];
  voiceAlreadySent?: boolean;
}

export interface GeneratedMedia {
  type: 'image' | 'video';
  filepath: string;
  prompt?: string;
}

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  source: 'dashboard' | 'telegram';
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
  updatedAt: number;
  telegramChatId?: string;
  telegramUserName?: string;
  decisionBy?: string;
}

export interface TeamRuntimeRecord {
  id: string;
  name: string;
  members: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CronRuntimeRecord {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  target: 'dashboard' | 'telegram';
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
}

// Session / conversation types
export interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  provider?: ProviderName;
  model?: string;
}

// Telegram types
export interface TelegramConfig {
  enabled: boolean;
  botToken?: string;
  botUsername?: string;
  allowedUserId?: string;
  pairedChatId?: string;
  pairedUserId?: string;
  pairedUserName?: string;
  voiceReplies?: boolean;
}

// Inbox (Telegram ↔ dashboard bridge)
export interface InboxMessage {
  id: string;
  direction: 'incoming' | 'outgoing' | 'system';
  content: string;
  telegramChatId?: string;
  telegramUserName?: string;
  timestamp: number;
  source: 'telegram' | 'dashboard' | 'system';
}
