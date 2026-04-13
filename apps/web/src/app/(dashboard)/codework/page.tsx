'use client';
import { useState, useEffect, useRef } from 'react';
import { Code2, FolderOpen, Play, Terminal, ChevronRight, File, Folder, X, Plus, Bot, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import clsx from 'clsx';

interface FileEntry { name: string; path: string; isDir: boolean; size?: number; }

export default function CodeworkPage() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<{ path: string; content: string } | null>(null);
  const [workspace, setWorkspace] = useState('');
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const termRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/files')
      .then(r => r.json())
      .then(data => {
        if (data.success) { setFiles(data.files); setWorkspace(data.workspace); }
      });
  }, []);

  async function openFile(path: string) {
    const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (data.success) setActiveFile({ path, content: data.content });
  }

  function toggleDir(p: string) {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  async function runTask() {
    if (!task.trim() || isRunning) return;
    setIsRunning(true);
    setOutput(prev => [...prev, `> ${task}`]);
    setTask('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `You are an autonomous coding agent. Complete this coding task, writing files to the workspace as needed: ${task}` }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let fullReply = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');
        for (const line of lines) {
          if (!line.startsWith('event: ')) continue;
          const [eventLine, dataLine] = line.split('\n');
          const event = eventLine.replace('event: ', '').trim();
          const dataStr = dataLine?.replace('data: ', '').trim();
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (event === 'text') fullReply += data.chunk;
            if (event === 'toolStart') setOutput(prev => [...prev, `⚡ Running: ${data.name}`]);
            if (event === 'toolEnd') setOutput(prev => [...prev, `✓ Done: ${data.name}`]);
            if (event === 'done') {
              setOutput(prev => [...prev, `\n${fullReply}`]);
              // Refresh file tree
              fetch('/api/files').then(r => r.json()).then(d => { if (d.success) setFiles(d.files); });
            }
          } catch {}
        }
      }
    } finally {
      setIsRunning(false);
      setTimeout(() => termRef.current?.scrollTo(0, termRef.current.scrollHeight), 100);
    }
  }

  // Build tree from flat list
  const topLevel = files.filter(f => !f.path.includes('/') && !f.path.includes('\\'));

  function renderTree(entries: FileEntry[], depth = 0) {
    return entries.map(f => {
      const children = files.filter(c => {
        const rel = c.path.replace(/\\/g, '/');
        const parent = f.path.replace(/\\/g, '/');
        return rel.startsWith(parent + '/') && !rel.slice(parent.length + 1).includes('/');
      });
      const isExpanded = expandedDirs.has(f.path);
      return (
        <div key={f.path}>
          <button
            onClick={() => f.isDir ? toggleDir(f.path) : openFile(f.path)}
            className={clsx(
              'flex items-center gap-1.5 w-full text-left px-2 py-1 text-xs rounded hover:bg-white/5 transition-colors group',
              activeFile?.path === f.path && 'bg-brand-600/20 text-brand-300'
            )}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            {f.isDir ? (
              <>
                <ChevronRight size={12} className={clsx('text-[var(--text-subtle)] transition-transform', isExpanded && 'rotate-90')} />
                <Folder size={13} className="text-amber-400 shrink-0" />
              </>
            ) : (
              <>
                <span className="w-3" />
                <File size={13} className="text-[var(--text-muted)] shrink-0" />
              </>
            )}
            <span className="truncate text-[var(--text-muted)] group-hover:text-white">{f.name}</span>
          </button>
          {f.isDir && isExpanded && renderTree(children, depth + 1)}
        </div>
      );
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="h-14 flex items-center gap-3 px-5 border-b border-[var(--border)] bg-[rgba(10,10,31,0.6)] shrink-0">
        <Code2 size={18} className="text-brand-400" />
        <h2 className="font-semibold text-white">Codework</h2>
        <span className="text-xs text-[var(--text-subtle)] ml-2">Autonomous coding agent with workspace file access</span>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* File Tree */}
        <aside className="w-52 shrink-0 border-r border-[var(--border)] bg-[rgba(5,5,16,0.4)] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
              <FolderOpen size={12} /> Workspace
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {topLevel.length === 0 ? (
              <div className="text-xs text-[var(--text-subtle)] px-3 py-4 text-center">Empty workspace</div>
            ) : renderTree(topLevel)}
          </div>
          <div className="px-3 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-subtle)] truncate">
            {workspace}
          </div>
        </aside>

        {/* Main Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Code Viewer */}
          <div className="flex-1 overflow-auto bg-[rgba(5,5,16,0.6)] relative">
            {activeFile ? (
              <div>
                <div className="sticky top-0 flex items-center gap-2 px-4 py-2 bg-[rgba(10,10,31,0.9)] border-b border-[var(--border)] z-10">
                  <File size={14} className="text-brand-400" />
                  <span className="text-sm font-mono text-[var(--text-muted)]">{activeFile.path}</span>
                  <button onClick={() => setActiveFile(null)} className="ml-auto text-[var(--text-subtle)] hover:text-white">
                    <X size={14} />
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono text-[var(--text-muted)] overflow-auto whitespace-pre-wrap break-words">
                  {activeFile.content}
                </pre>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-[var(--text-subtle)]">
                <Code2 size={40} className="text-brand-600/30 mb-4" />
                <p className="text-sm">Select a file to view, or give the agent a coding task below</p>
              </div>
            )}
          </div>

          {/* Terminal / Agent Output */}
          <div className="h-52 shrink-0 border-t border-[var(--border)] flex flex-col bg-[rgba(3,3,12,0.8)]">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
              <Terminal size={13} className="text-green-400" />
              <span className="text-xs font-medium text-green-400 font-mono">Agent Output</span>
              {isRunning && <span className="text-xs text-amber-400 ml-auto animate-pulse">● Running...</span>}
              {output.length > 0 && !isRunning && (
                <button onClick={() => setOutput([])} className="ml-auto text-[var(--text-subtle)] hover:text-white text-xs">
                  Clear
                </button>
              )}
            </div>
            <div ref={termRef} className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs">
              {output.map((line, i) => (
                <div key={i} className={clsx(
                  line.startsWith('>') ? 'text-brand-300' :
                  line.startsWith('⚡') ? 'text-amber-400' :
                  line.startsWith('✓') ? 'text-green-400' : 'text-[var(--text-muted)]'
                )}>
                  {line}
                </div>
              ))}
              {output.length === 0 && (
                <div className="text-[var(--text-subtle)]">Agent output will appear here...</div>
              )}
            </div>

            {/* Task Input */}
            <div className="px-3 pb-3">
              <form onSubmit={e => { e.preventDefault(); runTask(); }} className="flex gap-2">
                <input
                  value={task}
                  onChange={e => setTask(e.target.value)}
                  placeholder="Give the agent a coding task... e.g. 'Create a Python script that fetches weather'"
                  className="flex-1 bg-[rgba(15,15,46,0.6)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm text-white placeholder:text-[var(--text-subtle)] outline-none focus:border-brand-500 transition-colors"
                  disabled={isRunning}
                />
                <button
                  type="submit"
                  disabled={!task.trim() || isRunning}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-xl text-sm transition-colors flex items-center gap-2"
                >
                  <Play size={14} />
                  Run
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
