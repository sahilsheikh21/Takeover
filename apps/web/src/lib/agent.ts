import type { Message, Settings } from '@/types';
import type { LLMTool } from './providers';
import { streamResponse } from './providers';
import { getAvailableTools, getTool, evaluateToolPermission } from './tools';
import { loadSettings, loadSkills } from './data';

// ─── Persona system prompts ─────────────────────────────────────────────────-
const PERSONA_PROMPTS: Record<string, string> = {
  default: `You are Takeover, a powerful local AI Desktop Agent. You are running on Windows. You help users with any task — writing, coding, analysis, research, planning, and more. You have access to tools that let you read/write files, run commands, and search the web. Be concise, helpful, and proactive. When you use a tool, explain what you're doing.`,

  coder: `You are Takeover, an expert AI coding assistant. You are running on Windows. You excel at writing clean, efficient code in any language. You can read codebases, write files, run commands, and debug issues. You prefer concrete solutions over theoretical explanations. Always provide working code. When you make changes, explain why.`,

  entrepreneur: `You are Takeover, an AI business advisor and productivity assistant. You are running on Windows. You help with strategy, planning, analysis, and execution. You're direct, action-oriented, and focus on outcomes. You ask clarifying questions before diving in. You help prioritize ruthlessly.`,

  family: `You are Takeover, a friendly and supportive AI assistant for the whole family. You help with organization, planning, reminders, research, and everyday tasks. You communicate clearly and warmly. You're patient and thorough.`,

  student: `You are Takeover, an AI study companion and academic assistant. You help with research, writing, understanding complex topics, and organizing information. You explain things clearly, provide examples, and encourage deep understanding over memorization.`,
};

// ─── Agent loop ───────────────────────────────────────────────────────────────
export interface AgentOptions {
  settings?: Settings;
  sessionMessages?: Message[];
  enabledSkillIds?: string[];
  maxSteps?: number;
  approvedTools?: string[];
  maxToolCalls?: number;
  // Called as each text chunk arrives
  onText?: (chunk: string) => void;
  // Called when a tool is about to run
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  // Called when a tool finishes
  onToolEnd?: (name: string, result: string) => void;
  // Called when a tool is blocked by policy
  onToolBlocked?: (name: string, reason: string, args: Record<string, unknown>) => void;
  // Called on error
  onError?: (err: string) => void;
}

export interface AgentResult {
  response: string;
  toolsUsed: string[];
  blockedTools: Array<{ name: string; reason: string }>;
  steps: number;
  totalToolCalls: number;
  success: boolean;
  error?: string;
}

const MAX_CONTEXT_MESSAGES = 40;
const MAX_CONTEXT_CHARS = 60_000;

function compactSessionMessages(messages: Message[]): Message[] {
  if (messages.length <= MAX_CONTEXT_MESSAGES) {
    const rawChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (rawChars <= MAX_CONTEXT_CHARS) return messages;
  }

  const result: Message[] = [];
  let totalChars = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const nextChars = totalChars + msg.content.length;
    if (result.length >= MAX_CONTEXT_MESSAGES || nextChars > MAX_CONTEXT_CHARS) {
      break;
    }
    result.push(msg);
    totalChars = nextChars;
  }

  return result.reverse();
}

export async function runAgent(
  userMessage: string,
  options: AgentOptions = {}
): Promise<AgentResult> {
  const settings = options.settings || loadSettings();
  const skillState = loadSkills();
  const enabledSkillIds = options.enabledSkillIds ||
    Object.entries(skillState.skills)
      .filter(([, s]) => s.enabled)
      .map(([id]) => id);

  const availableTools = getAvailableTools(enabledSkillIds);
  const toolDefs: LLMTool[] = availableTools.map(t => t.definition);

  const persona = settings.persona || 'default';
  const systemPrompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.default;

  const compactHistory = compactSessionMessages(
    (options.sessionMessages || []).filter(m => m.role !== 'system')
  );

  // Build messages array
  const messages: Message[] = [
    {
      id: 'system',
      role: 'system',
      content: `${systemPrompt}\n\nRuntime policy:\n- Think before acting; prefer the minimum number of tool calls.\n- Never fabricate tool results.\n- If Safe Mode blocks a tool, explain what was blocked and continue with safe alternatives.\n- Keep file and command operations scoped to the workspace.` ,
      timestamp: Date.now(),
    },
    ...compactHistory,
    {
      id: `user_${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    },
  ];

  const maxSteps = options.maxSteps ?? 10;
  const maxToolCalls = options.maxToolCalls ?? 24;
  const approvedTools = new Set(options.approvedTools || []);
  let fullResponse = '';
  const toolsUsed: string[] = [];
  const blockedTools: Array<{ name: string; reason: string }> = [];
  let steps = 0;
  let totalToolCalls = 0;

  while (steps < maxSteps) {
    steps++;
    let stepText = '';
    const pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = [];

    // Stream this step
    for await (const chunk of streamResponse(settings, messages, toolDefs)) {
      if (chunk.type === 'text' && chunk.text) {
        stepText += chunk.text;
        options.onText?.(chunk.text);
      }
      if (chunk.type === 'tool_call' && chunk.toolCall) {
        pendingToolCalls.push(chunk.toolCall);
      }
      if (chunk.type === 'error') {
        options.onError?.(chunk.error || 'Unknown error');
        return {
          response: fullResponse || chunk.error || 'An error occurred',
          toolsUsed,
          blockedTools,
          steps,
          totalToolCalls,
          success: false,
          error: chunk.error,
        };
      }
    }

    const assistantToolCalls = pendingToolCalls.map((tc) => {
      let parsedArguments: Record<string, unknown> = {};
      try {
        parsedArguments = JSON.parse(tc.arguments || '{}');
      } catch {
        parsedArguments = { raw: tc.arguments || '' };
      }
      return {
        id: tc.id,
        name: tc.name,
        arguments: parsedArguments,
      };
    });

    if (stepText || assistantToolCalls.length > 0) {
      if (stepText) {
        fullResponse += (fullResponse ? '\n' : '') + stepText;
      }

      messages.push({
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: stepText,
        timestamp: Date.now(),
        toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : undefined,
      });
    }

    // No tool calls → we're done
    if (pendingToolCalls.length === 0) break;

    // Execute tools
    for (const tc of pendingToolCalls) {
      if (totalToolCalls >= maxToolCalls) {
        const reason = `Tool call limit reached (${maxToolCalls})`; 
        blockedTools.push({ name: tc.name, reason });
        options.onToolBlocked?.(tc.name, reason, {});
        messages.push({
          id: `tool_${Date.now()}_${tc.id}`,
          role: 'tool',
          content: `Tool blocked: ${reason}`,
          timestamp: Date.now(),
          toolCalls: [{ id: tc.id, name: tc.name, arguments: {} }],
        });
        continue;
      }

      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.arguments || '{}'); } catch {}

      const permission = evaluateToolPermission({
        safeMode: settings.safeMode,
        toolName: tc.name,
        args,
        approved: approvedTools.has(tc.name),
      });

      if (!permission.allowed) {
        blockedTools.push({ name: tc.name, reason: permission.reason });
        options.onToolBlocked?.(tc.name, permission.reason, args);
        messages.push({
          id: `tool_${Date.now()}_${tc.id}`,
          role: 'tool',
          content: `Tool blocked: ${permission.reason}`,
          timestamp: Date.now(),
          toolCalls: [{ id: tc.id, name: tc.name, arguments: args }],
        });
        continue;
      }

      options.onToolStart?.(tc.name, args);
      toolsUsed.push(tc.name);
      totalToolCalls++;

      const tool = getTool(tc.name);
      let result: string;
      if (tool) {
        try { result = await tool.execute(args); }
        catch (e) { result = `Tool error: ${(e as Error).message}`; }
      } else {
        result = `Unknown tool: ${tc.name}`;
      }

      options.onToolEnd?.(tc.name, result);

      // Add tool result to messages
      messages.push({
        id: `tool_${Date.now()}_${tc.id}`,
        role: 'tool',
        content: result,
        timestamp: Date.now(),
        toolCalls: [{ id: tc.id, name: tc.name, arguments: args }],
      });
    }
  }

  return {
    response: fullResponse,
    toolsUsed,
    blockedTools,
    steps,
    totalToolCalls,
    success: true,
  };
}

// ─── Non-streaming agent (for Telegram, cron jobs) ───────────────────────────
export async function runAgentNonStreaming(
  userMessage: string,
  options: AgentOptions = {}
): Promise<AgentResult> {
  return runAgent(userMessage, { ...options, onText: undefined });
}
