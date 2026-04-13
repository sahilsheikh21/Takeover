'use client';
import { useState, useEffect } from 'react';
import { Calendar, Plus, Check, Loader2, X, Trash2, Clock, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

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
  pending:  { icon: Clock,         color: 'text-[var(--text-muted)]',   bg: 'bg-white/5',          label: 'Pending'  },
  running:  { icon: Loader2,       color: 'text-amber-400',             bg: 'bg-amber-500/10',     label: 'Running'  },
  done:     { icon: CheckCircle2,  color: 'text-green-400',             bg: 'bg-green-500/10',     label: 'Done'     },
  failed:   { icon: AlertCircle,   color: 'text-red-400',               bg: 'bg-red-500/10',       label: 'Failed'   },
};

export default function PlannerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadTasks() {
    const res = await fetch('/api/tasks');
    const data = await res.json();
    if (data.success) setTasks(data.tasks);
    setIsLoading(false);
  }

  useEffect(() => { loadTasks(); }, []);

  async function createTask() {
    if (!newTitle.trim()) return;
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', title: newTitle, description: newDesc }),
    });
    const data = await res.json();
    if (data.success) {
      setTasks(prev => [data.task, ...prev]);
      setNewTitle(''); setNewDesc(''); setShowNew(false);
    }
  }

  async function deleteTask(id: string) {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  async function runTask(task: Task) {
    // Update to running
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: task.id, status: 'running' }),
    });
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'running' } : t));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `${task.title}${task.description ? '\n\n' + task.description : ''}` }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullReply = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n\n');
          for (const line of lines) {
            if (!line.startsWith('event: ')) continue;
            const [el, dl] = line.split('\n');
            const event = el.replace('event: ', '').trim();
            const dataStr = dl?.replace('data: ', '').trim();
            if (!dataStr) continue;
            try {
              const d = JSON.parse(dataStr);
              if (event === 'text') fullReply += d.chunk;
            } catch {}
          }
        }
      }

      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: task.id, status: 'done', result: fullReply }),
      });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'done', result: fullReply } : t));
    } catch (e) {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: task.id, status: 'failed', result: (e as Error).message }),
      });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed' } : t));
    }
  }

  const counts = {
    pending: tasks.filter(t => t.status === 'pending').length,
    running: tasks.filter(t => t.status === 'running').length,
    done:    tasks.filter(t => t.status === 'done').length,
    failed:  tasks.filter(t => t.status === 'failed').length,
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-[var(--border)] bg-[rgba(10,10,31,0.6)]">
        <div className="flex items-center gap-3">
          <Calendar size={18} className="text-brand-400" />
          <h2 className="font-semibold text-white text-lg">Planner</h2>
          <span className="text-xs text-[var(--text-subtle)] ml-1">Background task queue</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadTasks} className="btn-ghost text-[var(--text-muted)]"><RefreshCw size={14} /></button>
          <button onClick={() => setShowNew(true)} className="btn-primary">
            <Plus size={16} /> New Task
          </button>
        </div>
      </header>

      <div className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            {(Object.entries(counts) as [string, number][]).map(([status, count]) => {
              const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
              const Icon = cfg.icon;
              return (
                <div key={status} className={clsx('glass rounded-xl p-4 flex items-center gap-3', cfg.bg)}>
                  <Icon size={18} className={clsx(cfg.color, status === 'running' && 'animate-spin')} />
                  <div>
                    <div className="text-xl font-bold text-white">{count}</div>
                    <div className="text-xs text-[var(--text-subtle)]">{cfg.label}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* New Task Form */}
          {showNew && (
            <div className="glass rounded-2xl p-5 border border-brand-500/30 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-medium text-white">New Task</h3>
                <button onClick={() => setShowNew(false)} className="text-[var(--text-subtle)] hover:text-white"><X size={16} /></button>
              </div>
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Task title / instruction for the agent..."
                className="input w-full"
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && createTask()}
              />
              <textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Optional: more context or detailed instructions..."
                className="input w-full resize-none h-20 text-sm"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowNew(false)} className="btn-ghost">Cancel</button>
                <button onClick={createTask} disabled={!newTitle.trim()} className="btn-primary">
                  <Plus size={14} /> Create Task
                </button>
              </div>
            </div>
          )}

          {/* Task List */}
          {isLoading ? (
            <div className="text-center py-16 text-[var(--text-subtle)]">
              <Loader2 size={24} className="animate-spin mx-auto mb-3" />
              Loading tasks...
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-20 text-[var(--text-subtle)]">
              <Calendar size={40} className="mx-auto mb-4 text-brand-600/30" />
              <p className="text-sm">No tasks yet. Create one to let the agent work on it!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map(task => {
                const cfg = STATUS_CONFIG[task.status];
                const Icon = cfg.icon;
                const isExpanded = expandedId === task.id;
                return (
                  <div key={task.id} className={clsx('glass rounded-xl border transition-all', cfg.bg, task.status === 'running' && 'border-amber-500/30')}>
                    <div className="flex items-start gap-3 p-4">
                      <Icon size={18} className={clsx(cfg.color, 'mt-0.5 shrink-0', task.status === 'running' && 'animate-spin')} />
                      <div className="flex-1 min-w-0">
                        <button onClick={() => setExpandedId(isExpanded ? null : task.id)} className="text-left w-full">
                          <div className="font-medium text-white text-sm">{task.title}</div>
                          {task.description && <div className="text-xs text-[var(--text-muted)] mt-1 truncate">{task.description}</div>}
                        </button>
                        {isExpanded && task.result && (
                          <div className="mt-3 text-xs text-[var(--text-muted)] bg-black/30 rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
                            {task.result}
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className={clsx('text-[10px] font-semibold uppercase tracking-wider', cfg.color)}>{cfg.label}</span>
                          <span className="text-[10px] text-[var(--text-subtle)]">{new Date(task.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {task.status === 'pending' && (
                          <button onClick={() => runTask(task)} className="p-1.5 rounded-lg hover:bg-brand-600/20 text-brand-400" title="Run task">
                            <Check size={14} />
                          </button>
                        )}
                        <button onClick={() => deleteTask(task.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-subtle)] hover:text-red-400" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
