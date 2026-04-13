'use client';
import { useState, useEffect } from 'react';
import { Zap, Globe, Image as ImageIcon, Terminal, Mail, Github, BotMessageSquare, Calendar } from 'lucide-react';
import clsx from 'clsx';
import type { Skill } from '@/types';

// Hardcoded metadata for prettier UI
const SKILL_META: Record<string, { title: string, desc: string, icon: any, color: string }> = {
  weather:        { title: 'Weather', desc: 'Current conditions and forecasts', icon: Globe, color: 'text-sky-400' },
  web_search:     { title: 'Web Search', desc: 'Real-time information retrieval', icon: Globe, color: 'text-blue-400' },
  image_gen:      { title: 'Image Generation', desc: 'Create images via DALL-E or local models', icon: ImageIcon, color: 'text-pink-400' },
  browser:        { title: 'Browser Control', desc: 'Headless automation via Playwright', icon: Globe, color: 'text-indigo-400' },
  code_exec:      { title: 'Code Execution', desc: 'Run sandboxed Python, Node, etc.', icon: Terminal, color: 'text-emerald-400' },
  email:          { title: 'Email Integration', desc: 'Send and read emails via IMAP/SMTP', icon: Mail, color: 'text-amber-400' },
  github:         { title: 'GitHub', desc: 'Manage issues, PRs, and repos', icon: Github, color: 'text-slate-300' },
  telegram:       { title: 'Telegram Interface', desc: 'Control agent remotely via Telegram bot', icon: BotMessageSquare, color: 'text-cyan-400' },
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Record<string, { id: string; enabled: boolean }>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/skills')
      .then(r => r.json())
      .then(data => {
        if (data.success) setSkills(data.skills);
        setIsLoading(false);
      });
  }, []);

  async function toggleSkill(id: string, current: boolean) {
    const next = !current;
    // Optimistic UI
    setSkills(prev => ({ ...prev, [id]: { id, enabled: next } }));
    
    try {
      await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled: next })
      });
    } catch (e) {
      // Revert on error
      setSkills(prev => ({ ...prev, [id]: { id, enabled: current } }));
      console.error(e);
    }
  }

  if (isLoading) return <div className="p-8 text-center text-[var(--text-subtle)]">Loading skills...</div>;

  return (
    <div className="flex flex-col h-full overflow-y-auto w-full p-8 md:p-12">
      <div className="max-w-5xl mx-auto w-full space-y-8">
        
        <header className="mb-10 text-center">
           <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-brand-600/15 flex items-center justify-center glow-brand border border-brand-500/20">
              <Zap size={32} className="text-brand-400" />
           </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-3">Capabilities & Skills</h1>
          <p className="text-[var(--text-muted)] max-w-lg mx-auto">
            Toggle tools that the AI agent is allowed to use autonomously during an objective.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Object.entries(skills).map(([key, skill]) => {
            const meta = SKILL_META[key] || { title: key, desc: 'Unknown skill', icon: Zap, color: 'text-white' };
            const Icon = meta.icon;
            
            return (
              <div 
                key={key} 
                className={clsx(
                  "relative p-6 rounded-2xl transition-all duration-300",
                  skill.enabled 
                    ? "bg-white/10 border border-white/15 shadow-[0_4px_30px_rgba(0,0,0,0.4)]" 
                    : "bg-[#0d0d1f] border border-[var(--border)] opacity-70 grayscale-[30%] hover:grayscale-0 hover:opacity-100"
                )}
              >
                {/* Status indicator glow */}
                {skill.enabled && (
                  <div className="absolute inset-0 rounded-2xl rounded-tr-2xl bg-gradient-to-tr from-transparent flex to-brand-500/5 pointer-events-none" />
                )}

                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center", skill.enabled ? "bg-white/10" : "bg-white/5")}>
                    <Icon size={24} className={clsx(skill.enabled ? meta.color : "text-gray-500")} />
                  </div>

                  <label className="flex items-center cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={skill.enabled}
                        onChange={() => toggleSkill(key, skill.enabled)}
                        className="sr-only"
                      />
                      <div className={clsx(
                        "w-12 h-6 rounded-full transition-colors duration-300 border",
                        skill.enabled ? "bg-brand-600 border-brand-500" : "bg-white/5 border-white/10"
                      )}></div>
                      <div className={clsx(
                        "absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow",
                         skill.enabled ? "translate-x-6" : "translate-x-0"
                      )}></div>
                    </div>
                  </label>
                </div>

                <div className="relative z-10">
                  <h3 className={clsx("font-semibold text-lg mb-1", skill.enabled ? "text-white" : "text-gray-300")}>
                    {meta.title}
                  </h3>
                  <p className="text-sm text-[var(--text-subtle)] leading-relaxed">
                    {meta.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
