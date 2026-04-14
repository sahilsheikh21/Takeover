'use client';
import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Send, Bot, User, Trash2, Cpu } from 'lucide-react';
import clsx from 'clsx';
import type { Message } from '@/types';
import { consumeSSE } from '@/lib/sse';

const CHAT_STORAGE_KEY = 'takeover.dashboard.chat.v1';

interface PendingApproval {
  id: string;
  sessionId: string;
  toolName: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
}

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as { messages?: Message[]; sessionId?: string };
      if (Array.isArray(parsed.messages)) {
        // Never restore mid-stream state after remount; render last stable assistant content.
        const restored = parsed.messages.map((msg) => ({
          ...msg,
          isStreaming: false,
        }));
        setMessages(restored);
      }
      if (typeof parsed.sessionId === 'string') {
        setSessionId(parsed.sessionId);
      }
    } catch {
      // Ignore malformed cache and continue with a fresh session.
    } finally {
      setIsStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isStorageReady) return;

    try {
      const stableMessages = messages.map((msg) => ({ ...msg, isStreaming: false }));
      window.localStorage.setItem(
        CHAT_STORAGE_KEY,
        JSON.stringify({
          messages: stableMessages,
          sessionId,
        })
      );
    } catch {
      // Ignore persistence failures and keep in-memory chat usable.
    }
  }, [messages, sessionId, isStorageReady]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!sessionId) {
      setPendingApprovals([]);
      return;
    }

    void loadPendingApprovals(sessionId);
  }, [sessionId]);

  async function loadPendingApprovals(currentSessionId: string) {
    try {
      const res = await fetch(`/api/approvals?sessionId=${encodeURIComponent(currentSessionId)}&status=pending`);
      const data = await res.json();
      if (data.success && Array.isArray(data.approvals)) {
        setPendingApprovals(data.approvals as PendingApproval[]);
      }
    } catch {
      // keep chat usable even if approval endpoint is unavailable
    }
  }

  async function decideApproval(id: string, action: 'approve' | 'deny') {
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          id,
          decisionBy: 'dashboard-user',
        }),
      });

      const data = await res.json();
      if (!data.success) return;

      setPendingApprovals((prev) => prev.filter((item) => item.id !== id));
    } catch {
      // ignore and leave pending approval visible
    }
  }

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const userMsg = input.trim();
    setInput('');
    setIsGenerating(true);

    const tempId = `temp_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: 'user', content: userMsg, timestamp: Date.now() },
      { id: `ast_${tempId}`, role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true },
    ]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, sessionId }),
      });

      if (!res.ok) throw new Error('Failed to connect to chat API');

      let currentAssistantMessage = '';
      let isFirstToolAdded = false;

      await consumeSSE(res.body, (event, data) => {
        const payload = typeof data === 'string' || data === null ? {} : data;

        if (event === 'session') {
          const incomingSessionId = String(payload.sessionId || '');
          if (!sessionId && incomingSessionId) setSessionId(incomingSessionId);
          return;
        }

        if (event === 'text') {
          currentAssistantMessage += String(payload.chunk || '');
          setMessages((prev) => {
            const newMsgs = [...prev];
            const last = newMsgs[newMsgs.length - 1];
            if (last && last.role === 'assistant' && last.isStreaming) {
              last.content = currentAssistantMessage;
            }
            return newMsgs;
          });
          return;
        }

        if (event === 'toolStart') {
          if (!isFirstToolAdded) {
            currentAssistantMessage += '\n\n';
            isFirstToolAdded = true;
          }
          currentAssistantMessage += `> Running tool: \`${String(payload.name || 'unknown')}\`\n\n`;
          setMessages((prev) => {
            const newMsgs = [...prev];
            const last = newMsgs[newMsgs.length - 1];
            if (last && last.role === 'assistant' && last.isStreaming) {
              last.content = currentAssistantMessage;
            }
            return newMsgs;
          });
          return;
        }

        if (event === 'toolEnd') {
          currentAssistantMessage += `<details><summary>Output</summary>\n\n\`\`\`\n${String(payload.result || '')}\n\`\`\`\n</details>\n\n`;
          setMessages((prev) => {
            const newMsgs = [...prev];
            const last = newMsgs[newMsgs.length - 1];
            if (last && last.role === 'assistant' && last.isStreaming) {
              last.content = currentAssistantMessage;
            }
            return newMsgs;
          });
          return;
        }

        if (event === 'toolBlocked') {
          currentAssistantMessage += `\n\n> Tool blocked: ${String(payload.name || 'unknown')} (${String(payload.reason || 'policy')})\n\n`;
          setMessages((prev) => {
            const newMsgs = [...prev];
            const last = newMsgs[newMsgs.length - 1];
            if (last && last.role === 'assistant' && last.isStreaming) {
              last.content = currentAssistantMessage;
            }
            return newMsgs;
          });
          return;
        }

        if (event === 'approvalRequired') {
          const approval = payload.approval as PendingApproval | undefined;
          if (approval?.id) {
            setPendingApprovals((prev) => {
              if (prev.some((item) => item.id === approval.id)) return prev;
              return [approval, ...prev];
            });
          }
          return;
        }

        if (event === 'error') {
          const errorMessage = String(payload.error || 'Unknown error');
          currentAssistantMessage += `\n\n**Error:** ${errorMessage}`;
          setMessages((prev) => {
            const newMsgs = [...prev];
            const last = newMsgs[newMsgs.length - 1];
            if (last && last.role === 'assistant' && last.isStreaming) {
              last.content = currentAssistantMessage;
            }
            return newMsgs;
          });
          return;
        }

        if (event === 'done') {
          const sessionPending = Array.isArray(payload.pendingApprovals)
            ? (payload.pendingApprovals as PendingApproval[])
            : [];
          setPendingApprovals(sessionPending);

          setMessages((prev) => {
            const newMsgs = [...prev];
            const last = newMsgs[newMsgs.length - 1];
            if (last && last.role === 'assistant') {
              last.isStreaming = false;
            }
            return newMsgs;
          });
        }
      });

      setMessages((prev) => {
        const newMsgs = [...prev];
        const last = newMsgs[newMsgs.length - 1];
        if (last && last.role === 'assistant') {
          last.isStreaming = false;
        }
        return newMsgs;
      });
    } catch {
      setMessages((prev) => {
        const newMsgs = [...prev];
        const last = newMsgs[newMsgs.length - 1];
        if (last && last.role === 'assistant') {
          last.isStreaming = false;
          last.content += '\n\n**Connection Error:** Could not reach the API.';
        }
        return newMsgs;
      });
    } finally {
      setIsGenerating(false);
    }
  }

  function handleClear() {
    setMessages([]);
    setSessionId('');
    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {}
  }

  return (
    <div className="flex flex-col h-full relative">
      <header className="h-16 flex items-center justify-between px-6 border-b border-white/15 bg-[rgba(0,0,0,0.8)] [backdrop-filter:saturate(180%)_blur(20px)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-brand-300">
            <Cpu size={18} />
          </div>
          <h2 className="font-semibold text-lg text-white">Agent Chat</h2>
        </div>
        <button onClick={handleClear} className="btn-ghost text-[var(--text-muted)] hover:text-white hover:bg-white/10">
          <Trash2 size={16} />
          <span>Clear</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] mt-[-10vh]">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mb-6 text-brand-300 glow-brand">
              <Bot size={32} />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">How can I help you today?</h3>
            <p className="text-sm text-center max-w-sm">I can write code, run commands, manage files, and search the web.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={clsx('flex gap-4', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-[#0071e3] flex items-center justify-center mt-1 shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px]">
                    <Bot size={16} className="text-white" />
                  </div>
                )}

                <div
                  className={clsx(
                    'px-5 py-4 rounded-2xl max-w-[85%]',
                    msg.role === 'user'
                      ? 'bg-[#1d1d1f] text-white rounded-br-sm border border-white/10'
                      : 'glass rounded-bl-sm prose-chat'
                  )}
                >
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div className={clsx(msg.isStreaming && 'typing-cursor')}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {msg.content || '...'}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-white/15 flex items-center justify-center mt-1">
                    <User size={16} className="text-white/60" />
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} className="h-4" />
          </div>
        )}
      </div>

      <div className="p-4 bg-[rgba(0,0,0,0.82)] [backdrop-filter:saturate(180%)_blur(20px)] border-t border-white/15">
        <div className="max-w-4xl mx-auto relative group">
          {pendingApprovals.length > 0 && (
            <div className="mb-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3">
              <div className="mb-2 text-xs uppercase tracking-[0.12em] text-amber-200">Pending approvals</div>
              <div className="space-y-2">
                {pendingApprovals.slice(0, 6).map((approval) => (
                  <div key={approval.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-white">{approval.toolName}</div>
                      <div className="truncate text-xs text-[var(--text-muted)]">{approval.reason}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void decideApproval(approval.id, 'approve')}
                      className="rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/20"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void decideApproval(approval.id, 'deny')}
                      className="rounded-full border border-rose-400/40 px-3 py-1 text-xs text-rose-200 transition-colors hover:bg-rose-500/20"
                    >
                      Deny
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSend} className="relative flex items-end gradient-border">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask me anything... (Press Enter to send)"
              className="w-full bg-white/10 rounded-2xl py-4 pl-5 pr-14 text-white placeholder:text-[var(--text-subtle)] resize-none outline-none border border-white/15 group-hover:border-[#2997ff]/60 focus:border-[#0071e3] transition-all duration-300 min-h-[56px] max-h-[30vh]"
              rows={Math.min(5, input.split('\n').length)}
              disabled={isGenerating}
            />
            <button
              type="submit"
              disabled={!input.trim() || isGenerating}
              className="absolute right-3 bottom-3 p-2 rounded-xl text-white bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 disabled:bg-white/10 disabled:text-white/30 transition-all duration-200"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
