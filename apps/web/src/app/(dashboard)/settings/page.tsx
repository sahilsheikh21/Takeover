'use client';
import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Key, Server, User, ShieldAlert, Cpu, Send, Plug, Plus, Trash2, FlaskConical } from 'lucide-react';
import type { MCPServerConfig, ProviderConfig, ProviderName, Settings, TelegramConfig } from '@/types';

interface ProviderOption {
  id: ProviderName;
  label: string;
  apiKeyPlaceholder?: string;
  modelPlaceholder: string;
  baseUrlPlaceholder?: string;
  requiresApiKey: boolean;
  supportsBaseUrl: boolean;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    modelPlaceholder: 'qwen2.5:3b-instruct',
    baseUrlPlaceholder: 'http://localhost:11434',
    requiresApiKey: false,
    supportsBaseUrl: true,
  },
  {
    id: 'groq',
    label: 'Groq',
    apiKeyPlaceholder: 'gsk_...',
    modelPlaceholder: 'llama-3.3-70b-versatile',
    requiresApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    apiKeyPlaceholder: 'sk-...',
    modelPlaceholder: 'gpt-4o-mini',
    requiresApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    apiKeyPlaceholder: 'sk-ant-...',
    modelPlaceholder: 'claude-3-5-haiku-20241022',
    requiresApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'google',
    label: 'Google',
    apiKeyPlaceholder: 'AIza...',
    modelPlaceholder: 'gemini-2.0-flash',
    requiresApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    apiKeyPlaceholder: 'sk-or-...',
    modelPlaceholder: 'openai/gpt-4o-mini',
    baseUrlPlaceholder: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    supportsBaseUrl: true,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    apiKeyPlaceholder: '...',
    modelPlaceholder: 'mistral-small-latest',
    requiresApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    apiKeyPlaceholder: 'sk-...',
    modelPlaceholder: 'deepseek-chat',
    requiresApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'xai',
    label: 'xAI',
    apiKeyPlaceholder: 'xai-...',
    modelPlaceholder: 'grok-3-mini',
    requiresApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'fireworks',
    label: 'Fireworks',
    apiKeyPlaceholder: 'fw_...',
    modelPlaceholder: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
    requiresApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'together',
    label: 'Together',
    apiKeyPlaceholder: '...',
    modelPlaceholder: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    requiresApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'cohere',
    label: 'Cohere',
    apiKeyPlaceholder: '...',
    modelPlaceholder: 'command-r-plus',
    requiresApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    apiKeyPlaceholder: 'pplx-...',
    modelPlaceholder: 'llama-3.1-sonar-large-128k-online',
    requiresApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    modelPlaceholder: 'local-model',
    baseUrlPlaceholder: 'http://localhost:1234/v1',
    requiresApiKey: false,
    supportsBaseUrl: true,
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    apiKeyPlaceholder: 'optional',
    modelPlaceholder: 'your-model-name',
    baseUrlPlaceholder: 'http://localhost:8000/v1',
    requiresApiKey: true,
    supportsBaseUrl: true,
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [telegram, setTelegram] = useState<TelegramConfig>({ enabled: false, voiceReplies: true });
  const [testingMcpId, setTestingMcpId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          // Initialize ollama defaults if missing to avoid uncontrolled input issues
          if (!data.settings.providers) data.settings.providers = {};
          if (!data.settings.providers.ollama) {
              data.settings.providers.ollama = { baseUrl: 'http://localhost:11434', model: 'qwen2.5:3b-instruct' };
          }
          setSettings(data.settings);
          setTelegram(data.telegram || { enabled: false, voiceReplies: true });
        }
        setIsLoading(false);
      });
  }, []);

  async function handleSave() {
    if (!settings) return;
    setIsSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, telegram })
      });
      const data = await res.json();
      if (data.success) {
        if (data.settings) setSettings(data.settings);
        if (data.telegram) setTelegram(data.telegram);
        setMessage('Settings saved successfully');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (e) {
      setMessage(`Save failed: ${(e as Error).message}`);
    }
    setIsSaving(false);
  }

  function updateProvider(provider: ProviderName, field: keyof ProviderConfig, value: string) {
    setSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [provider]: {
            ...prev.providers[provider as keyof typeof prev.providers],
            [field]: value
          }
        }
      };
    });
  }

  function updateMcpServer(index: number, field: keyof MCPServerConfig, value: string | boolean) {
    setSettings((prev) => {
      if (!prev) return prev;
      const current = [...(prev.mcpServers || [])];
      const existing = current[index];
      if (!existing) return prev;
      current[index] = {
        ...existing,
        [field]: value,
      };
      return {
        ...prev,
        mcpServers: current,
      };
    });
  }

  function addMcpServer(preset?: Partial<MCPServerConfig>) {
    setSettings((prev) => {
      if (!prev) return prev;
      const next: MCPServerConfig = {
        id: `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: preset?.name || 'New MCP Server',
        command: preset?.command || '',
        args: preset?.args || '',
        cwd: preset?.cwd || '',
        enabled: preset?.enabled ?? false,
      };
      return {
        ...prev,
        mcpServers: [...(prev.mcpServers || []), next],
      };
    });
  }

  function addMcpPresets() {
    const presets: Array<Partial<MCPServerConfig>> = [
      {
        name: 'Filesystem (Workspace)',
        command: 'npx',
        args: '-y @modelcontextprotocol/server-filesystem ./.takeover-data/workspace',
      },
      {
        name: 'Fetch',
        command: 'npx',
        args: '-y @modelcontextprotocol/server-fetch',
      },
    ];

    for (const preset of presets) {
      addMcpServer(preset);
    }
  }

  function removeMcpServer(index: number) {
    setSettings((prev) => {
      if (!prev) return prev;
      const current = [...(prev.mcpServers || [])];
      current.splice(index, 1);
      return {
        ...prev,
        mcpServers: current,
      };
    });
  }

  async function testMcpServer(server: MCPServerConfig) {
    if (!server.command.trim()) {
      setMessage('MCP test failed: command is required.');
      return;
    }

    setTestingMcpId(server.id);
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          server,
        }),
      });

      const data = await res.json();
      setMessage(data.success ? `MCP test OK (${server.name}).` : `MCP test failed (${server.name}): ${data.output || data.error}`);
    } catch (error) {
      setMessage(`MCP test failed: ${(error as Error).message}`);
    } finally {
      setTestingMcpId(null);
    }
  }

  if (isLoading) return <div className="p-8 text-center text-[var(--text-subtle)]">Loading settings...</div>;
  if (!settings) return <div className="p-8 text-center text-red-400">Failed to load settings</div>;

  return (
    <div className="flex flex-col h-full overflow-y-auto w-full p-8 p-12">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        
        <header className="flex justify-between items-end mb-10 border-b border-[var(--border)] pb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <SettingsIcon className="text-brand-400" />
              Settings
            </h1>
            <p className="text-[var(--text-muted)] mt-2">Configure AI providers, personas, and safety preferences.</p>
          </div>
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className="btn-primary"
          >
            <Save size={18} />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </header>

        {message && (
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-medium">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Config Column */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Active Provider */}
            <section className="glass rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Cpu size={20} className="text-brand-400" />
                Active Provider
              </h2>
              <select
                value={settings.activeProvider}
                onChange={(e) => setSettings({ ...settings, activeProvider: e.target.value as ProviderName })}
                className="input cursor-pointer"
              >
                {PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </section>

            {/* Provider Configurations */}
            <section className="glass rounded-2xl p-6 space-y-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Server size={20} className="text-brand-400" />
                Provider Details
              </h2>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {PROVIDER_OPTIONS.map((provider) => (
                  <div key={provider.id} className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/5">
                    <h3 className="font-medium text-[var(--brand-light)]">{provider.label}</h3>

                    {provider.supportsBaseUrl && (
                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">Base URL</label>
                        <input
                          type="text"
                          value={settings.providers[provider.id]?.baseUrl || ''}
                          onChange={(e) => updateProvider(provider.id, 'baseUrl', e.target.value)}
                          placeholder={provider.baseUrlPlaceholder || 'https://api.example.com/v1'}
                          className="input"
                        />
                      </div>
                    )}

                    {provider.requiresApiKey && (
                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">API Key</label>
                        <div className="relative">
                          <Key size={16} className="absolute left-3 top-3 text-[var(--text-subtle)]" />
                          <input
                            type="password"
                            value={settings.providers[provider.id]?.apiKey || ''}
                            onChange={(e) => updateProvider(provider.id, 'apiKey', e.target.value)}
                            placeholder={provider.apiKeyPlaceholder || '...'}
                            className="input pl-10"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">Model Name</label>
                      <input
                        type="text"
                        value={settings.providers[provider.id]?.model || ''}
                        onChange={(e) => updateProvider(provider.id, 'model', e.target.value)}
                        placeholder={provider.modelPlaceholder}
                        className="input"
                      />
                    </div>
                  </div>
                ))}
              </div>

            </section>

            <section className="glass rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Plug size={20} className="text-brand-400" />
                  MCP Servers
                </h2>
                <div className="flex gap-2">
                  <button type="button" onClick={addMcpPresets} className="btn-ghost text-xs">
                    Add Presets
                  </button>
                  <button type="button" onClick={() => addMcpServer()} className="btn-ghost text-xs inline-flex items-center gap-1">
                    <Plus size={14} /> Add Server
                  </button>
                </div>
              </div>

              <p className="text-xs text-[var(--text-muted)]">
                Configure MCP servers here. Save settings, then use Test to verify server startup.
              </p>

              {(settings.mcpServers || []).length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text-subtle)]">
                  No MCP servers configured yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {(settings.mcpServers || []).map((server, index) => (
                    <div key={server.id} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={server.name}
                          onChange={(e) => updateMcpServer(index, 'name', e.target.value)}
                          placeholder="Server name"
                          className="input"
                        />

                        <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)] whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={Boolean(server.enabled)}
                            onChange={(e) => updateMcpServer(index, 'enabled', e.target.checked)}
                          />
                          Enabled
                        </label>

                        <button
                          type="button"
                          onClick={() => void testMcpServer(server)}
                          disabled={testingMcpId === server.id}
                          className="btn-ghost text-xs inline-flex items-center gap-1"
                        >
                          <FlaskConical size={13} />
                          {testingMcpId === server.id ? 'Testing...' : 'Test'}
                        </button>

                        <button
                          type="button"
                          onClick={() => removeMcpServer(index)}
                          className="btn-ghost text-xs inline-flex items-center gap-1 text-rose-300"
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">Command</label>
                        <input
                          type="text"
                          value={server.command || ''}
                          onChange={(e) => updateMcpServer(index, 'command', e.target.value)}
                          placeholder="npx"
                          className="input"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">Args</label>
                        <input
                          type="text"
                          value={server.args || ''}
                          onChange={(e) => updateMcpServer(index, 'args', e.target.value)}
                          placeholder="-y @modelcontextprotocol/server-filesystem ./.takeover-data/workspace"
                          className="input"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">Working Directory (optional)</label>
                        <input
                          type="text"
                          value={server.cwd || ''}
                          onChange={(e) => updateMcpServer(index, 'cwd', e.target.value)}
                          placeholder="d:/Theshit/Takeover"
                          className="input"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar Config Column */}
          <div className="space-y-8">
            
            {/* Persona */}
            <section className="glass rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <User size={18} className="text-brand-400" />
                Persona
              </h2>
              <select
                value={settings.persona}
                onChange={(e) => setSettings({ ...settings, persona: e.target.value as any })}
                className="input cursor-pointer"
              >
                <option value="default">Default Assistant</option>
                <option value="coder">Expert Coder</option>
                <option value="entrepreneur">Entrepreneur</option>
                <option value="family">Family Assistant</option>
                <option value="student">Study Companion</option>
              </select>
            </section>

            {/* Safety */}
            <section className="glass rounded-2xl p-6 border-amber-500/20">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-amber-400">
                <ShieldAlert size={18} />
                Safety
              </h2>
              
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center mt-1">
                  <input
                    type="checkbox"
                    checked={settings.safeMode}
                    onChange={(e) => setSettings({ ...settings, safeMode: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors ${settings.safeMode ? 'bg-amber-500' : 'bg-white/10'}`}></div>
                  <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.safeMode ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </div>
                <div>
                  <div className="font-medium text-white group-hover:text-amber-200 transition-colors">Safe Mode</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">
                    Require manual approval for file writes and command execution.
                  </div>
                </div>
              </label>

            </section>

            {/* Telegram */}
            <section className="glass rounded-2xl p-6 border-cyan-500/20">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-cyan-300">
                <Send size={18} />
                Telegram
              </h2>

              <label className="flex items-start gap-3 cursor-pointer group mb-5">
                <div className="relative flex items-center mt-1">
                  <input
                    type="checkbox"
                    checked={Boolean(telegram.enabled)}
                    onChange={(e) => setTelegram((prev) => ({ ...prev, enabled: e.target.checked }))}
                    className="sr-only"
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors ${telegram.enabled ? 'bg-cyan-500' : 'bg-white/10'}`}></div>
                  <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform ${telegram.enabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </div>
                <div>
                  <div className="font-medium text-white group-hover:text-cyan-100 transition-colors">Enable Telegram Bot</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">
                    Restart the desktop app after saving if you changed Telegram settings.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer group mb-5">
                <div className="relative flex items-center mt-1">
                  <input
                    type="checkbox"
                    checked={telegram.voiceReplies !== false}
                    onChange={(e) => setTelegram((prev) => ({ ...prev, voiceReplies: e.target.checked }))}
                    className="sr-only"
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors ${telegram.voiceReplies !== false ? 'bg-cyan-500' : 'bg-white/10'}`}></div>
                  <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform ${telegram.voiceReplies !== false ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </div>
                <div>
                  <div className="font-medium text-white group-hover:text-cyan-100 transition-colors">Voice Replies</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">
                    Reply to Telegram voice notes with generated voice output (uses OpenAI key).
                  </div>
                </div>
              </label>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">Bot Token</label>
                  <input
                    type="password"
                    value={telegram.botToken || ''}
                    onChange={(e) => setTelegram((prev) => ({ ...prev, botToken: e.target.value }))}
                    placeholder="123456789:AA..."
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">Allowed User ID</label>
                  <input
                    type="text"
                    value={telegram.allowedUserId || ''}
                    onChange={(e) => setTelegram((prev) => ({ ...prev, allowedUserId: e.target.value.trim() }))}
                    placeholder="123456789"
                    className="input"
                  />
                  <div className="mt-1 text-xs text-[var(--text-subtle)]">
                    Set this to your Telegram numeric user ID. Only this user can control the bot.
                  </div>
                </div>

                {telegram.pairedChatId && (
                  <div className="text-xs text-[var(--text-subtle)]">
                    Paired chat: {telegram.pairedChatId}
                  </div>
                )}

                {telegram.pairedUserId && (
                  <div className="text-xs text-[var(--text-subtle)]">
                    Last authorized user ID: {telegram.pairedUserId}
                  </div>
                )}
              </div>
            </section>
          </div>

        </div>
      </div>
    </div>
  );
}
