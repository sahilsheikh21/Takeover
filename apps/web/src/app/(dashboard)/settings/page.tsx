'use client';
import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Key, Server, User, ShieldAlert, Cpu, Send } from 'lucide-react';
import type { Settings, TelegramConfig } from '@/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [telegram, setTelegram] = useState<TelegramConfig>({ enabled: false });
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
          setTelegram(data.telegram || { enabled: false });
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

  function updateProvider(provider: string, field: string, value: string) {
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

  function generatePairingCode() {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    setTelegram((prev) => ({ ...prev, pairingCode: code }));
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
                onChange={(e) => setSettings({ ...settings, activeProvider: e.target.value as any })}
                className="input cursor-pointer"
              >
                <option value="ollama">Ollama (Local, Free)</option>
                <option value="groq">Groq (Fast, Free Tier)</option>
                <option value="openai">OpenAI (GPT-4o)</option>
                <option value="anthropic">Anthropic (Claude 3.5)</option>
                <option value="google">Google (Gemini)</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </section>

            {/* Provider Configurations */}
            <section className="glass rounded-2xl p-6 space-y-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Server size={20} className="text-brand-400" />
                Provider Details
              </h2>

              {/* Ollama */ }
              <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/5">
                <h3 className="font-medium text-[var(--brand-light)]">Ollama Config</h3>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">Base URL</label>
                  <input
                    type="text"
                    value={settings.providers.ollama?.baseUrl || ''}
                    onChange={(e) => updateProvider('ollama', 'baseUrl', e.target.value)}
                    placeholder="http://localhost:11434"
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">Model Name</label>
                  <input
                    type="text"
                    value={settings.providers.ollama?.model || ''}
                    onChange={(e) => updateProvider('ollama', 'model', e.target.value)}
                    placeholder="qwen2.5:3b-instruct"
                    className="input"
                  />
                </div>
              </div>

               {/* Groq */ }
               <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/5">
                <h3 className="font-medium text-[var(--brand-light)]">Groq</h3>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">API Key</label>
                  <div className="relative">
                    <Key size={16} className="absolute left-3 top-3 text-[var(--text-subtle)]" />
                    <input
                      type="password"
                      value={settings.providers.groq?.apiKey || ''}
                      onChange={(e) => updateProvider('groq', 'apiKey', e.target.value)}
                      placeholder="gsk_..."
                      className="input pl-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">Model Name</label>
                  <input
                    type="text"
                    value={settings.providers.groq?.model || ''}
                    onChange={(e) => updateProvider('groq', 'model', e.target.value)}
                    placeholder="llama-3.3-70b-versatile"
                    className="input"
                  />
                </div>
              </div>

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
                    Restart the desktop app after saving if you changed token or enabled state.
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
                  <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold">Pairing Code</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={telegram.pairingCode || ''}
                      onChange={(e) => setTelegram((prev) => ({ ...prev, pairingCode: e.target.value.toUpperCase() }))}
                      placeholder="ABC123"
                      className="input"
                    />
                    <button type="button" onClick={generatePairingCode} className="btn-ghost whitespace-nowrap">
                      Generate
                    </button>
                  </div>
                </div>

                {telegram.pairedChatId && (
                  <div className="text-xs text-[var(--text-subtle)]">
                    Paired chat: {telegram.pairedChatId}
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
