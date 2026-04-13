'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronRight, Code2, Diff, File, Folder, FolderOpen, Play, Terminal, X } from 'lucide-react';
import clsx from 'clsx';
import { consumeSSE } from '@/lib/sse';

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
}

interface DiffLine {
  kind: 'same' | 'added' | 'removed' | 'changed';
  oldNumber?: number;
  newNumber?: number;
  oldText: string;
  newText: string;
}

interface DiffStats {
  added: number;
  removed: number;
  changed: number;
}

const MAX_SNAPSHOT_FILES = 120;
const MAX_SNAPSHOT_FILE_BYTES = 120_000;

function normalizePath(p: string) {
  return p.replace(/\\/g, '/');
}

function comparePaths(a: string, b: string) {
  const aDepth = normalizePath(a).split('/').length;
  const bDepth = normalizePath(b).split('/').length;
  if (aDepth !== bDepth) return aDepth - bDepth;
  return a.localeCompare(b);
}

function buildDiffLines(previousContent: string, currentContent: string): DiffLine[] {
  const oldLines = previousContent.split(/\r?\n/);
  const newLines = currentContent.split(/\r?\n/);
  const maxLines = Math.max(oldLines.length, newLines.length);
  const lines: DiffLine[] = [];

  for (let i = 0; i < maxLines; i++) {
    const oldText = oldLines[i];
    const newText = newLines[i];

    if (oldText === undefined && newText !== undefined) {
      lines.push({
        kind: 'added',
        oldText: '',
        newText,
        newNumber: i + 1,
      });
      continue;
    }

    if (newText === undefined && oldText !== undefined) {
      lines.push({
        kind: 'removed',
        oldText,
        newText: '',
        oldNumber: i + 1,
      });
      continue;
    }

    if (oldText === newText) {
      lines.push({
        kind: 'same',
        oldText: oldText || '',
        newText: newText || '',
        oldNumber: i + 1,
        newNumber: i + 1,
      });
      continue;
    }

    lines.push({
      kind: 'changed',
      oldText: oldText || '',
      newText: newText || '',
      oldNumber: i + 1,
      newNumber: i + 1,
    });
  }

  return lines;
}

function getDiffStats(lines: DiffLine[]): DiffStats {
  return lines.reduce(
    (acc, line) => {
      if (line.kind === 'added') acc.added += 1;
      if (line.kind === 'removed') acc.removed += 1;
      if (line.kind === 'changed') acc.changed += 1;
      return acc;
    },
    { added: 0, removed: 0, changed: 0 },
  );
}

export default function CodeworkPage() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [workspace, setWorkspace] = useState('');
  const [activeFile, setActiveFile] = useState<{ path: string; content: string } | null>(null);
  const [selectedDiffPath, setSelectedDiffPath] = useState('');
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [beforeSnapshot, setBeforeSnapshot] = useState<Record<string, string>>({});
  const [afterSnapshot, setAfterSnapshot] = useState<Record<string, string>>({});
  const [changedPaths, setChangedPaths] = useState<string[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  async function refreshWorkspace() {
    const res = await fetch('/api/files');
    const data = await res.json();
    if (!data.success) return;
    setFiles(data.files);
    setWorkspace(data.workspace);
  }

  async function readWorkspaceFileContent(filePath: string): Promise<string> {
    const res = await fetch(`/api/files?path=${encodeURIComponent(filePath)}`);
    const data = await res.json();
    if (!data.success) return '';
    return String(data.content || '');
  }

  async function captureWorkspaceSnapshot(targetFiles: FileEntry[]): Promise<Record<string, string>> {
    const candidates = targetFiles
      .filter((entry) => !entry.isDir)
      .filter((entry) => (entry.size ?? 0) <= MAX_SNAPSHOT_FILE_BYTES)
      .sort((a, b) => comparePaths(a.path, b.path))
      .slice(0, MAX_SNAPSHOT_FILES);

    const entries = await Promise.all(
      candidates.map(async (entry) => [entry.path, await readWorkspaceFileContent(entry.path)] as const),
    );
    return Object.fromEntries(entries);
  }

  function computeChangedFiles(previous: Record<string, string>, current: Record<string, string>) {
    const allFiles = new Set([...Object.keys(previous), ...Object.keys(current)]);
    return Array.from(allFiles)
      .filter((filePath) => (previous[filePath] ?? '') !== (current[filePath] ?? ''))
      .sort(comparePaths);
  }

  async function openFile(filePath: string) {
    const content = await readWorkspaceFileContent(filePath);
    setActiveFile({ path: filePath, content });
    if (changedPaths.includes(filePath)) {
      setSelectedDiffPath(filePath);
    }
  }

  function toggleDir(dirPath: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }

  async function runTask() {
    if (!task.trim() || isRunning) return;

    const taskToRun = task.trim();
    setIsRunning(true);
    setOutput((prev) => [...prev, `> ${taskToRun}`]);
    setTask('');

    try {
      const snapshotBefore = await captureWorkspaceSnapshot(files);
      setBeforeSnapshot(snapshotBefore);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `You are an autonomous coding agent. Complete this coding task, writing files to the workspace as needed: ${taskToRun}`,
        }),
      });

      let fullReply = '';
      await consumeSSE(res.body, (event, data) => {
        const payload = typeof data === 'string' || data === null ? {} : data;

        if (event === 'text') {
          fullReply += String(payload.chunk || '');
          return;
        }

        if (event === 'toolStart') {
          setOutput((prev) => [...prev, `⚡ Running: ${String(payload.name || 'unknown')}`]);
          return;
        }

        if (event === 'toolEnd') {
          setOutput((prev) => [...prev, `✓ Done: ${String(payload.name || 'unknown')}`]);
          return;
        }

        if (event === 'done') {
          setOutput((prev) => [...prev, `\n${fullReply}`]);
        }
      });

      const latestRes = await fetch('/api/files');
      const latestData = await latestRes.json();

      if (latestData.success) {
        setFiles(latestData.files);
        setWorkspace(latestData.workspace);

        const snapshotAfter = await captureWorkspaceSnapshot(latestData.files);
        setAfterSnapshot(snapshotAfter);

        const changed = computeChangedFiles(snapshotBefore, snapshotAfter);
        setChangedPaths(changed);

        if (changed.length > 0) {
          setSelectedDiffPath(changed[0]);
          setOutput((prev) => [...prev, `✓ Changed ${changed.length} file(s).`]);
        } else {
          setOutput((prev) => [...prev, 'ℹ No file changes detected in workspace snapshot.']);
        }
      }
    } catch (error) {
      setOutput((prev) => [...prev, `✗ Error: ${(error as Error).message}`]);
    } finally {
      setIsRunning(false);
      setTimeout(() => {
        terminalRef.current?.scrollTo(0, terminalRef.current.scrollHeight);
      }, 80);
    }
  }

  const topLevelFiles = useMemo(
    () => files.filter((entry) => !normalizePath(entry.path).includes('/')),
    [files],
  );

  const selectedDiffLines = useMemo(() => {
    if (!selectedDiffPath) return [];
    return buildDiffLines(beforeSnapshot[selectedDiffPath] ?? '', afterSnapshot[selectedDiffPath] ?? '');
  }, [afterSnapshot, beforeSnapshot, selectedDiffPath]);

  const selectedStats = useMemo(() => getDiffStats(selectedDiffLines), [selectedDiffLines]);

  function renderTree(entries: FileEntry[], depth = 0): JSX.Element[] {
    const sortedEntries = [...entries].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return sortedEntries.map((entry) => {
      const parent = normalizePath(entry.path);
      const children = files.filter((item) => {
        const childPath = normalizePath(item.path);
        return childPath.startsWith(`${parent}/`) && !childPath.slice(parent.length + 1).includes('/');
      });

      const isExpanded = expandedDirs.has(entry.path);
      const isChanged = changedPaths.includes(entry.path);

      return (
        <div key={entry.path}>
          <button
            onClick={() => {
              if (entry.isDir) {
                toggleDir(entry.path);
                return;
              }
              void openFile(entry.path);
            }}
            className={clsx(
              'group flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-white/5',
              activeFile?.path === entry.path && 'bg-brand-600/20 text-brand-300',
            )}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            {entry.isDir ? (
              <>
                <ChevronRight
                  size={12}
                  className={clsx(
                    'text-[var(--text-subtle)] transition-transform',
                    isExpanded && 'rotate-90',
                  )}
                />
                <Folder size={13} className="shrink-0 text-amber-400" />
              </>
            ) : (
              <>
                <span className="w-3" />
                <File size={13} className="shrink-0 text-[var(--text-muted)]" />
              </>
            )}

            <span className="truncate text-[var(--text-muted)] group-hover:text-white">{entry.name}</span>

            {isChanged && !entry.isDir && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#2997ff]" />
            )}
          </button>

          {entry.isDir && isExpanded && renderTree(children, depth + 1)}
        </div>
      );
    });
  }

  return (
    <div className="flex h-full flex-col bg-[#000000]">
      <header className="drag-region h-14 shrink-0 border-b border-white/15 bg-[rgba(0,0,0,0.8)] px-5 [backdrop-filter:saturate(180%)_blur(20px)]">
        <div className="no-drag flex h-full items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0071e3] shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px]">
            <Code2 size={16} className="text-white" />
          </div>

          <div>
            <h2 className="font-semibold tracking-tight text-white">Codework</h2>
            <p className="text-[11px] text-[var(--text-subtle)]">Apple-styled coding cockpit with live workspace diff view</p>
          </div>

          {changedPaths.length > 0 && (
            <div className="ml-auto rounded-full border border-[#2997ff]/45 px-3 py-1 text-[11px] text-[#2997ff]">
              {changedPaths.length} changed file(s)
            </div>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_380px]">
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[#1d1d1f]">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              <FolderOpen size={12} /> Workspace
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {topLevelFiles.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[var(--text-subtle)]">Empty workspace</div>
            ) : (
              renderTree(topLevelFiles)
            )}
          </div>

          <div className="truncate border-t border-white/10 px-3 py-2 text-[10px] text-[var(--text-subtle)]">
            {workspace}
          </div>
        </aside>

        <section className="relative flex min-h-0 flex-col bg-[#000000]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
            <Diff size={14} className="text-[#2997ff]" />
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Diff View</span>
          </div>

          {selectedDiffPath ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2 text-[11px] text-[var(--text-muted)]">
                <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-white">{selectedDiffPath}</span>
                <span className="rounded-full border border-emerald-400/40 px-2 py-0.5 text-emerald-300">+{selectedStats.added}</span>
                <span className="rounded-full border border-rose-400/40 px-2 py-0.5 text-rose-300">-{selectedStats.removed}</span>
                <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-amber-200">~{selectedStats.changed}</span>
              </div>

              <div className="flex-1 overflow-auto pb-3">
                <div className="min-w-[920px] font-mono text-[12px] leading-6">
                  {selectedDiffLines.map((line, index) => (
                    <div
                      key={`${line.oldNumber ?? 'x'}-${line.newNumber ?? 'y'}-${index}`}
                      className={clsx(
                        'grid grid-cols-[56px_1fr_56px_1fr] border-b border-white/5',
                        line.kind === 'added' && 'bg-emerald-500/10',
                        line.kind === 'removed' && 'bg-rose-500/10',
                        line.kind === 'changed' && 'bg-amber-500/10',
                      )}
                    >
                      <span className="px-2 text-right text-[var(--text-subtle)]">{line.oldNumber ?? ''}</span>
                      <span className="truncate border-r border-white/10 px-2 text-[var(--text-muted)]">{line.oldText}</span>
                      <span className="px-2 text-right text-[var(--text-subtle)]">{line.newNumber ?? ''}</span>
                      <span className="truncate px-2 text-white">{line.newText}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : activeFile ? (
            <>
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/10 bg-[#1d1d1f] px-4 py-2">
                <File size={14} className="text-[#2997ff]" />
                <span className="text-sm font-mono text-[var(--text-muted)]">{activeFile.path}</span>
                <button
                  onClick={() => setActiveFile(null)}
                  className="ml-auto text-[var(--text-subtle)] transition-colors hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              <pre className="flex-1 overflow-auto p-4 text-[12px] text-[var(--text-muted)]">{activeFile.content}</pre>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-[var(--text-subtle)]">
              <Code2 size={42} className="mb-4 text-[#2997ff]/35" />
              <p className="text-sm text-white">Run a coding task to populate live diffs</p>
              <p className="mt-2 text-xs">Changed files will appear here with before/after line comparison.</p>
            </div>
          )}

          {changedPaths.length > 0 && (
            <div className="border-t border-white/10 px-3 py-2">
              <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-[var(--text-subtle)]">Changed Files</div>
              <div className="flex flex-wrap gap-2">
                {changedPaths.map((filePath) => (
                  <button
                    key={filePath}
                    className={clsx(
                      'rounded-full border px-3 py-1 text-[11px] transition-colors',
                      selectedDiffPath === filePath
                        ? 'border-[#2997ff]/70 bg-[#0071e3]/20 text-[#8fc8ff]'
                        : 'border-white/15 text-[var(--text-muted)] hover:border-[#2997ff]/40 hover:text-white',
                    )}
                    onClick={() => setSelectedDiffPath(filePath)}
                  >
                    {filePath}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col border-t border-white/10 bg-[#000000] md:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
            <Terminal size={13} className="text-emerald-300" />
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Agent Output</span>

            {isRunning && <span className="ml-auto animate-pulse text-xs text-amber-300">Running...</span>}

            {output.length > 0 && !isRunning && (
              <button
                onClick={() => setOutput([])}
                className="ml-auto rounded-full border border-white/15 px-3 py-1 text-[11px] text-[var(--text-muted)] hover:border-white/25 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          <div ref={terminalRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs">
            <div className="space-y-1">
              {output.map((line, i) => (
                <div
                  key={i}
                  className={clsx(
                    line.startsWith('>') && 'text-brand-300',
                    line.startsWith('⚡') && 'text-amber-400',
                    line.startsWith('✓') && 'text-green-400',
                    line.startsWith('✗') && 'text-rose-300',
                    line.startsWith('ℹ') && 'text-blue-200',
                    !line.startsWith('>') && !line.startsWith('⚡') && !line.startsWith('✓') && !line.startsWith('✗') && !line.startsWith('ℹ') && 'text-[var(--text-muted)]',
                  )}
                >
                  {line}
                </div>
              ))}

              {output.length === 0 && (
                <div className="flex items-center gap-2 text-[var(--text-subtle)]">
                  <Bot size={13} className="text-[#2997ff]/70" />
                  Agent output will appear here...
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-white/10 p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runTask();
              }}
              className="flex gap-2"
            >
              <input
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Give the coding agent a concrete task..."
                className="flex-1 rounded-xl border border-white/15 bg-[#1d1d1f] px-4 py-2 text-sm text-white placeholder:text-[var(--text-subtle)] outline-none transition-colors focus:border-[#0071e3]"
                disabled={isRunning}
              />

              <button
                type="submit"
                disabled={!task.trim() || isRunning}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0071e3] px-4 py-2 text-sm text-white transition-colors hover:bg-[#0077ed] disabled:opacity-40"
              >
                <Play size={14} />
                Run
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
