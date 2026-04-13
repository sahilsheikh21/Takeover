'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { consumeSSE } from '@/lib/sse';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  createdAt: number;
  updatedAt: number;
  result?: string;
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'text-[var(--text-muted)]', accent: 'border-white/20', label: 'Pending' },
  running: { icon: Loader2, color: 'text-amber-300', accent: 'border-amber-400/40', label: 'Running' },
  done: { icon: CheckCircle2, color: 'text-emerald-300', accent: 'border-emerald-400/40', label: 'Done' },
  failed: { icon: AlertCircle, color: 'text-rose-300', accent: 'border-rose-400/40', label: 'Failed' },
} as const;

function formatTimestamp(ts: number) {
  return new Date(ts).toLocaleString();
}

function formatRelative(ts: number) {
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PlannerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadTasks(silent = false) {
    if (!silent) setIsLoading(true);
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.success) setTasks(data.tasks);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  async function createTask() {
    if (!newTitle.trim()) return;

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', title: newTitle.trim(), description: newDesc.trim() }),
    });
    const data = await res.json();
    if (!data.success) return;

    setTasks((prev) => [data.task, ...prev]);
    setNewTitle('');
    setNewDesc('');
    setShowNew(false);
  }

  async function deleteTask(id: string) {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    setTasks((prev) => prev.filter((task) => task.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  async function runTask(task: Task) {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: task.id, status: 'running' }),
    });
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'running', updatedAt: Date.now() } : t)));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `${task.title}${task.description ? `\n\n${task.description}` : ''}` }),
      });

      let fullReply = '';
      await consumeSSE(res.body, (event, data) => {
        const payload = typeof data === 'string' || data === null ? {} : data;
        if (event === 'text') {
          fullReply += String(payload.chunk || '');
        }
      });

      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: task.id, status: 'done', result: fullReply }),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id
        ? { ...t, status: 'done', result: fullReply, updatedAt: Date.now() }
        : t)));
    } catch (error) {
      const message = (error as Error).message || 'Task execution failed';
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: task.id, status: 'failed', result: message }),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id
        ? { ...t, status: 'failed', result: message, updatedAt: Date.now() }
        : t)));
    }
  }

  const counts = useMemo(() => ({
    pending: tasks.filter((task) => task.status === 'pending').length,
    running: tasks.filter((task) => task.status === 'running').length,
    done: tasks.filter((task) => task.status === 'done').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
  }), [tasks]);

  const completionRate = tasks.length === 0
    ? 0
    : Math.round((counts.done / tasks.length) * 100);

  return (
    <div className="flex h-full flex-col bg-[#000000]">
      <header className="h-14 shrink-0 border-b border-white/15 bg-[rgba(0,0,0,0.8)] px-5 [backdrop-filter:saturate(180%)_blur(20px)]">
        <div className="flex h-full items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0071e3] shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px]">
            <Calendar size={16} className="text-white" />
          </div>

          <div>
            <h2 className="font-semibold tracking-tight text-white">Planner</h2>
            <p className="text-[11px] text-[var(--text-subtle)]">Apple-style autonomous task queue</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => void loadTasks(true)}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:border-white/30 hover:text-white"
            >
              <RefreshCw size={12} className={clsx(isRefreshing && 'animate-spin')} />
              Refresh
            </button>
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#0071e3] px-4 py-1.5 text-xs text-white transition-colors hover:bg-[#0077ed]"
            >
              <Plus size={12} />
              New Task
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[#1d1d1f] p-4">
          <div className="mb-4 grid grid-cols-2 gap-3">
            {(Object.entries(counts) as Array<[keyof typeof counts, number]>).map(([status, count]) => {
              const cfg = STATUS_CONFIG[status];
              const Icon = cfg.icon;
              return (
                <div
                  key={status}
                  className={clsx('rounded-2xl border border-white/15 bg-black/30 p-3', cfg.accent)}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Icon size={13} className={clsx(cfg.color, status === 'running' && 'animate-spin')} />
                    <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-subtle)]">{cfg.label}</span>
                  </div>
                  <div className="text-lg font-semibold text-white">{count}</div>
                </div>
              );
            })}
          </div>

          <div className="mb-4 rounded-2xl border border-[#2997ff]/30 bg-[#0071e3]/10 p-4">
            <div className="mb-1 flex items-center gap-2 text-[#8fc8ff]">
              <Sparkles size={14} />
              <span className="text-xs uppercase tracking-[0.12em]">Completion</span>
            </div>
            <div className="text-2xl font-semibold text-white">{completionRate}%</div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{counts.done} of {tasks.length} tasks finished</p>
          </div>

          <div className="rounded-2xl border border-white/15 bg-black/25 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">Task Composer</h3>
              {showNew && (
                <button
                  onClick={() => setShowNew(false)}
                  className="rounded-md p-1 text-[var(--text-subtle)] transition-colors hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {!showNew ? (
              <button
                onClick={() => setShowNew(true)}
                className="w-full rounded-xl border border-dashed border-white/25 px-3 py-3 text-sm text-[var(--text-muted)] transition-colors hover:border-[#2997ff]/50 hover:text-white"
              >
                + Create a new task
              </button>
            ) : (
              <div className="space-y-3">
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="What should the agent do?"
                  className="w-full rounded-xl border border-white/15 bg-[#000000] px-3 py-2 text-sm text-white placeholder:text-[var(--text-subtle)] outline-none transition-colors focus:border-[#0071e3]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void createTask();
                    }
                  }}
                />
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Optional context, constraints, or expected output"
                  className="h-24 w-full resize-none rounded-xl border border-white/15 bg-[#000000] px-3 py-2 text-sm text-white placeholder:text-[var(--text-subtle)] outline-none transition-colors focus:border-[#0071e3]"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowNew(false)}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:border-white/30 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void createTask()}
                    disabled={!newTitle.trim()}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0071e3] px-3 py-1.5 text-xs text-white transition-colors hover:bg-[#0077ed] disabled:opacity-40"
                  >
                    <Plus size={12} />
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto bg-[#000000] p-4 md:p-6">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center text-[var(--text-subtle)]">
              <Loader2 size={24} className="mb-3 animate-spin text-[#2997ff]" />
              Loading tasks...
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-[var(--text-subtle)]">
              <Calendar size={42} className="mb-4 text-[#2997ff]/35" />
              <p className="text-sm text-white">No tasks yet</p>
              <p className="mt-1 text-xs">Create your first task from the composer panel.</p>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-3">
              {tasks.map((task) => {
                const cfg = STATUS_CONFIG[task.status];
                const Icon = cfg.icon;
                const isExpanded = expandedId === task.id;

                return (
                  <article
                    key={task.id}
                    className={clsx(
                      'rounded-2xl border border-white/15 bg-[#1d1d1f] transition-colors',
                      task.status === 'running' && 'border-amber-400/35',
                    )}
                  >
                    <div className="p-4">
                      <div className="mb-2 flex items-start gap-3">
                        <span className={clsx('mt-1 rounded-full border p-1.5', cfg.accent)}>
                          <Icon size={13} className={clsx(cfg.color, task.status === 'running' && 'animate-spin')} />
                        </span>

                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-medium text-white">{task.title}</h3>
                          {task.description && (
                            <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{task.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {task.status === 'pending' && (
                            <button
                              onClick={() => void runTask(task)}
                              className="rounded-lg p-1.5 text-[#8fc8ff] transition-colors hover:bg-[#0071e3]/20 hover:text-white"
                              title="Run task"
                            >
                              <Check size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => void deleteTask(task.id)}
                            className="rounded-lg p-1.5 text-[var(--text-subtle)] transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                            title="Delete task"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="mb-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.12em]">
                        <span className={cfg.color}>{cfg.label}</span>
                        <span className="text-[var(--text-subtle)]" title={formatTimestamp(task.createdAt)}>
                          created {formatRelative(task.createdAt)}
                        </span>
                        <span className="text-[var(--text-subtle)]" title={formatTimestamp(task.updatedAt)}>
                          updated {formatRelative(task.updatedAt)}
                        </span>
                      </div>

                      {task.result && (
                        <>
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : task.id)}
                            className="rounded-full border border-white/20 px-3 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[#2997ff]/40 hover:text-white"
                          >
                            {isExpanded ? 'Hide output' : 'View output'}
                          </button>

                          {isExpanded && (
                            <pre className="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-[12px] text-[var(--text-muted)]">
                              {task.result}
                            </pre>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
