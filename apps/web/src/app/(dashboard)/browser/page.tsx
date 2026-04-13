'use client';

import { useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Globe,
  History,
  Link as LinkIcon,
  Loader2,
  Monitor,
  Search,
  Sparkles,
} from 'lucide-react';
import { consumeSSE } from '@/lib/sse';

interface BrowserResult {
  title: string;
  url: string;
  text: string;
  links: Array<{ text: string; href: string }>;
}

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function parseBrowserResultCandidate(value: unknown): BrowserResult | null {
  if (!value || typeof value !== 'object') return null;

  const obj = value as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title : '';
  const url = typeof obj.url === 'string' ? obj.url : '';
  const text = typeof obj.text === 'string' ? obj.text : '';
  const linksRaw = Array.isArray(obj.links) ? obj.links : [];
  const links = linksRaw
    .map((link) => {
      if (!link || typeof link !== 'object') return null;
      const data = link as Record<string, unknown>;
      const href = typeof data.href === 'string' ? data.href : '';
      const textLabel = typeof data.text === 'string' ? data.text : href;
      if (!href) return null;
      return { text: textLabel, href };
    })
    .filter((link): link is { text: string; href: string } => Boolean(link));

  if (!url) return null;

  return {
    title: title || url,
    url,
    text,
    links,
  };
}

function extractBrowserResult(raw: string): BrowserResult | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const candidate = parseBrowserResultCandidate(parsed);
    if (candidate) return candidate;
  } catch {
    // Keep trying below via object-like fragments.
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;

  try {
    const parsed = JSON.parse(objectMatch[0]) as unknown;
    return parseBrowserResultCandidate(parsed);
  } catch {
    return null;
  }
}

export default function BrowserPage() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BrowserResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Array<{ url: string; title: string }>>([]);

  async function navigate() {
    if (!url.trim() || isLoading) return;

    const target = normalizeUrl(url);
    setUrl(target);
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Use the browser_action tool to navigate to "${target}" and extract the page content. Return only the resulting JSON object with title, url, text, and links.`,
        }),
      });

      let fullReply = '';
      let resolved = false;

      await consumeSSE(res.body, (event, data) => {
        const payload = typeof data === 'string' || data === null ? {} : data;

        if (event === 'text') {
          fullReply += String(payload.chunk || '');
          return;
        }

        if (event === 'toolEnd') {
          const rawToolResult = String(payload.result || '');
          const parsed = extractBrowserResult(rawToolResult);
          if (!parsed) return;

          resolved = true;
          setResult(parsed);
          setHistory((prev) => [{ url: parsed.url, title: parsed.title || parsed.url }, ...prev.filter((h) => h.url !== parsed.url)].slice(0, 12));
        }
      });

      if (!resolved) {
        const parsed = extractBrowserResult(fullReply);
        if (parsed) {
          setResult(parsed);
          setHistory((prev) => [{ url: parsed.url, title: parsed.title || parsed.url }, ...prev.filter((h) => h.url !== parsed.url)].slice(0, 12));
        } else {
          throw new Error('No structured browser result found.');
        }
      }
    } catch (e) {
      setError((e as Error).message || 'Navigation failed');
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#000000]">
      <header className="h-14 shrink-0 border-b border-white/15 bg-[rgba(0,0,0,0.8)] px-5 [backdrop-filter:saturate(180%)_blur(20px)]">
        <div className="flex h-full items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0071e3] shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px]">
            <Globe size={16} className="text-white" />
          </div>

          <div>
            <h2 className="font-semibold tracking-tight text-white">Browser</h2>
            <p className="text-[11px] text-[var(--text-subtle)]">Apple-style Playwright extraction cockpit</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void navigate();
            }}
            className="ml-auto flex min-w-[320px] max-w-[760px] flex-1 items-center gap-2"
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter URL to browse..."
              className="w-full rounded-full border border-white/20 bg-[#1d1d1f] px-4 py-2 text-sm text-white placeholder:text-[var(--text-subtle)] outline-none transition-colors focus:border-[#0071e3]"
            />
            <button
              type="submit"
              disabled={!url.trim() || isLoading}
              className="inline-flex items-center gap-2 rounded-full bg-[#0071e3] px-4 py-2 text-sm text-white transition-colors hover:bg-[#0077ed] disabled:opacity-40"
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {isLoading ? 'Loading' : 'Go'}
            </button>
          </form>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[#1d1d1f] p-4">
          <div className="mb-4 rounded-2xl border border-[#2997ff]/30 bg-[#0071e3]/10 p-4">
            <div className="mb-1 flex items-center gap-2 text-[#8fc8ff]">
              <Sparkles size={14} />
              <span className="text-xs uppercase tracking-[0.12em]">Quick Start</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">Open a page and extract text plus links with one agent call.</p>
          </div>

          <h3 className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[var(--text-subtle)]">
            <History size={12} />
            History
          </h3>
          <div className="flex-1 space-y-1 overflow-y-auto">
            {history.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/20 px-3 py-4 text-center text-xs text-[var(--text-subtle)]">
                No pages visited yet
              </div>
            ) : (
              history.map((item, idx) => (
                <button
                  key={`${item.url}-${idx}`}
                  onClick={() => setUrl(item.url)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left transition-colors hover:border-[#2997ff]/40 hover:bg-[#0071e3]/10"
                >
                  <div className="truncate text-xs text-white">{item.title}</div>
                  <div className="mt-1 truncate text-[10px] text-[var(--text-subtle)]">{item.url}</div>
                </button>
              ))
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {['https://news.ycombinator.com', 'https://github.com/trending', 'https://wikipedia.org', 'https://www.apple.com'].map((seed) => (
              <button
                key={seed}
                onClick={() => setUrl(seed)}
                className="rounded-xl border border-white/15 bg-black/25 px-2 py-2 text-left text-[11px] text-[#8fc8ff] transition-colors hover:border-[#2997ff]/40 hover:text-white"
              >
                {seed.replace(/^https?:\/\//, '')}
              </button>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto bg-[#000000] p-4 md:p-6">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center text-[var(--text-subtle)]">
              <Loader2 size={28} className="mb-3 animate-spin text-[#2997ff]" />
              Navigating with Playwright agent...
            </div>
          ) : error ? (
            <div className="mx-auto max-w-3xl rounded-2xl border border-rose-400/35 bg-rose-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="mt-0.5 text-rose-300" />
                <div>
                  <h3 className="text-sm font-medium text-rose-200">Navigation Error</h3>
                  <p className="mt-1 text-xs text-rose-200/90">{error}</p>
                </div>
              </div>
            </div>
          ) : result ? (
            <div className="mx-auto max-w-4xl space-y-4">
              <section className="rounded-2xl border border-white/15 bg-[#1d1d1f] p-4">
                <h1 className="text-xl font-semibold text-white">{result.title}</h1>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-2 text-xs text-[#8fc8ff] hover:underline"
                >
                  {result.url}
                  <ExternalLink size={12} />
                </a>
              </section>

              <section className="rounded-2xl border border-white/15 bg-[#1d1d1f] p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                  <Monitor size={15} className="text-[#8fc8ff]" />
                  Extracted Page Content
                </h2>
                <div className="max-h-[500px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-sm leading-relaxed text-[var(--text-muted)]">
                  {result.text || '(No extractable text found)'}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-[var(--text-subtle)]">
              <Globe size={42} className="mb-4 text-[#2997ff]/35" />
              <p className="text-sm text-white">No page loaded</p>
              <p className="mt-1 text-xs">Enter a URL in the top bar to extract a page.</p>
            </div>
          )}
        </main>

        <aside className="flex min-h-0 flex-col border-l border-white/10 bg-[#1d1d1f] p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[var(--text-subtle)]">
            <LinkIcon size={12} />
            Extracted Links
          </h3>

          {result?.links?.length ? (
            <div className="flex-1 space-y-2 overflow-y-auto">
              {result.links.map((link, idx) => (
                <button
                  key={`${link.href}-${idx}`}
                  onClick={() => setUrl(link.href)}
                  className="w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-left transition-colors hover:border-[#2997ff]/40 hover:bg-[#0071e3]/10"
                >
                  <div className="truncate text-xs text-[#8fc8ff]">{link.text || link.href}</div>
                  <div className="mt-1 truncate text-[10px] text-[var(--text-subtle)]">{link.href}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/20 px-3 py-4 text-center text-xs text-[var(--text-subtle)]">
              No links extracted yet
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-white/15 bg-black/25 p-3 text-[11px] text-[var(--text-subtle)]">
            Tip: click any extracted link to preload it into the address bar, then press Go.
          </div>
        </aside>
      </div>
    </div>
  );
}
