import type { Settings, ProviderName, Message } from '@/types';

// ─── Provider configuration ───────────────────────────────────────────────────
export interface LLMRequest {
  messages: Message[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: LLMTool[];
  stream?: boolean;
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface LLMChunk {
  type: 'text' | 'tool_call' | 'done' | 'error';
  text?: string;
  toolCall?: { id: string; name: string; arguments: string };
  error?: string;
}

// ─── Ollama provider ─────────────────────────────────────────────────────────
async function* streamOllama(
  messages: Message[],
  model: string,
  baseUrl: string,
  tools?: LLMTool[]
): AsyncGenerator<LLMChunk> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map(m => ({
      role: m.role === 'tool' ? 'tool' : m.role,
      content: m.content,
    })),
    stream: true,
    options: { temperature: 0.7 },
  };

  if (tools && tools.length > 0) {
    body.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  }

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    yield { type: 'error', error: `Ollama error ${res.status}: ${text.slice(0, 200)}` };
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.message?.content) {
          yield { type: 'text', text: chunk.message.content };
        }
        if (chunk.message?.tool_calls) {
          for (const tc of chunk.message.tool_calls) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: tc.id || `call_${Date.now()}`,
                name: tc.function.name,
                arguments: typeof tc.function.arguments === 'string'
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments),
              },
            };
          }
        }
        if (chunk.done) yield { type: 'done' };
      } catch { /* skip malformed */ }
    }
  }
}

// ─── OpenAI-compatible provider (OpenAI, Groq, DeepSeek, Mistral, xAI, OpenRouter, LM Studio, Custom)
async function* streamOpenAICompatible(
  messages: Message[],
  model: string,
  apiKey: string,
  baseUrl: string,
  tools?: LLMTool[]
): AsyncGenerator<LLMChunk> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map(m => ({
      role: m.role === 'tool' ? 'tool' : m.role,
      content: m.content,
    })),
    stream: true,
    temperature: 0.7,
  };

  if (tools && tools.length > 0) {
    body.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    body.tool_choice = 'auto';
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    yield { type: 'error', error: `API error ${res.status}: ${text.slice(0, 300)}` };
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const pendingToolCalls: Record<number, { id: string; name: string; args: string }> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') { yield { type: 'done' }; continue; }
      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) yield { type: 'text', text: delta.content };

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!pendingToolCalls[idx]) {
              pendingToolCalls[idx] = { id: tc.id || `call_${idx}`, name: '', args: '' };
            }
            if (tc.function?.name) pendingToolCalls[idx].name += tc.function.name;
            if (tc.function?.arguments) pendingToolCalls[idx].args += tc.function.arguments;
          }
        }

        if (chunk.choices?.[0]?.finish_reason === 'tool_calls') {
          for (const [, tc] of Object.entries(pendingToolCalls)) {
            yield { type: 'tool_call', toolCall: { id: tc.id, name: tc.name, arguments: tc.args } };
          }
        }
      } catch { /* skip malformed SSE */ }
    }
  }
}

// ─── Google Gemini provider ───────────────────────────────────────────────────
async function* streamGoogle(
  messages: Message[],
  model: string,
  apiKey: string,
  tools?: LLMTool[]
): AsyncGenerator<LLMChunk> {
  // Convert messages to Gemini format
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages.find(m => m.role === 'system');

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: 0.7 },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    const text = await res.text();
    yield { type: 'error', error: `Gemini error ${res.status}: ${text.slice(0, 200)}` };
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      try {
        const chunk = JSON.parse(data);
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield { type: 'text', text };
      } catch {}
    }
  }
  yield { type: 'done' };
}

// ─── Anthropic provider ───────────────────────────────────────────────────────
async function* streamAnthropic(
  messages: Message[],
  model: string,
  apiKey: string,
  tools?: LLMTool[]
): AsyncGenerator<LLMChunk> {
  const systemMsg = messages.find(m => m.role === 'system');
  const nonSystemMsgs = messages.filter(m => m.role !== 'system');

  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    stream: true,
    messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
  };

  if (systemMsg) body.system = systemMsg.content;
  if (tools && tools.length > 0) {
    body.tools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    yield { type: 'error', error: `Anthropic error ${res.status}: ${text.slice(0, 200)}` };
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          yield { type: 'text', text: chunk.delta.text };
        }
        if (chunk.type === 'message_stop') yield { type: 'done' };
      } catch {}
    }
  }
}

// ─── Base URLs by provider ─────────────────────────────────────────────────
const PROVIDER_URLS: Partial<Record<ProviderName, string>> = {
  openai:     'https://api.openai.com/v1',
  groq:       'https://api.groq.com/openai/v1',
  deepseek:   'https://api.deepseek.com/v1',
  mistral:    'https://api.mistral.ai/v1',
  xai:        'https://api.x.ai/v1',
  fireworks:  'https://api.fireworks.ai/inference/v1',
  together:   'https://api.together.xyz/v1',
  cohere:     'https://api.cohere.ai/compatibility/v1',
  perplexity: 'https://api.perplexity.ai',
  openrouter: 'https://openrouter.ai/api/v1',
  lmstudio:   'http://localhost:1234/v1',
};

// ─── Default models by provider ───────────────────────────────────────────────
export const DEFAULT_MODELS: Partial<Record<ProviderName, string>> = {
  ollama:     'qwen2.5:3b-instruct',
  openai:     'gpt-4o-mini',
  anthropic:  'claude-3-5-haiku-20241022',
  google:     'gemini-2.0-flash',
  groq:       'llama-3.3-70b-versatile',
  openrouter: 'openai/gpt-4o-mini',
  mistral:    'mistral-small-latest',
  deepseek:   'deepseek-chat',
  xai:        'grok-3-mini',
  fireworks:  'accounts/fireworks/models/llama-v3p1-70b-instruct',
  together:   'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  cohere:     'command-r-plus',
  perplexity: 'llama-3.1-sonar-large-128k-online',
  lmstudio:   'local-model',
};

// ─── Main stream function ────────────────────────────────────────────────────
export async function* streamResponse(
  settings: Settings,
  messages: Message[],
  tools?: LLMTool[]
): AsyncGenerator<LLMChunk> {
  const provider = settings.activeProvider;
  const providerConfig = settings.providers[provider] || {};
  const model = providerConfig.model || DEFAULT_MODELS[provider] || 'default';
  const apiKey = providerConfig.apiKey || '';

  try {
    switch (provider) {
      case 'ollama': {
        const base = providerConfig.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        yield* streamOllama(messages, model, base, tools);
        break;
      }
      case 'anthropic':
        yield* streamAnthropic(messages, model, apiKey, tools);
        break;
      case 'google':
        yield* streamGoogle(messages, model, apiKey, tools);
        break;
      case 'custom': {
        const base = providerConfig.baseUrl || 'http://localhost:8000/v1';
        yield* streamOpenAICompatible(messages, model, apiKey, base, tools);
        break;
      }
      case 'lmstudio': {
        const base = providerConfig.baseUrl || PROVIDER_URLS.lmstudio!;
        yield* streamOpenAICompatible(messages, model, apiKey, base, tools);
        break;
      }
      default: {
        const base = PROVIDER_URLS[provider] || `https://api.${provider}.com/v1`;
        yield* streamOpenAICompatible(messages, model, apiKey, base, tools);
      }
    }
  } catch (err) {
    const e = err as Error;
    if (e.message?.includes('ECONNREFUSED')) {
      yield { type: 'error', error: `Cannot connect to ${provider}. Is it running?` };
    } else {
      yield { type: 'error', error: e.message || 'Unknown provider error' };
    }
  }
}
