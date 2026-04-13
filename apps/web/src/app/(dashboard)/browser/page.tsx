'use client';
import { useState } from 'react';
import { Globe, Search, ExternalLink, Loader2, AlertCircle, Monitor, Link } from 'lucide-react';

interface BrowserResult {
  title: string;
  url: string;
  text: string;
  links: Array<{ text: string; href: string }>;
}

export default function BrowserPage() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BrowserResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<{ url: string; title: string }[]>([]);

  async function navigate() {
    if (!url.trim() || isLoading) return;
    const target = url.startsWith('http') ? url : `https://${url}`;
    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Use the browser_action tool to navigate to "${target}" and extract the page content. Return the full JSON result of the page.`
        }),
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
              if (event === 'toolEnd') {
                try {
                  const parsed = JSON.parse(d.result);
                  setResult(parsed);
                  setHistory(prev => [{ url: parsed.url, title: parsed.title || parsed.url }, ...prev.slice(0, 9)]);
                } catch {}
              }
            } catch {}
          }
        }
      }
      if (!result && fullReply) {
        // Try parsing JSON from the reply
        const json = fullReply.match(/\{[\s\S]*\}/)?.[0];
        if (json) { try { setResult(JSON.parse(json)); } catch {} }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Address Bar */}
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-[var(--border)] bg-[rgba(10,10,31,0.6)]">
        <Globe size={16} className="text-brand-400 shrink-0" />
        <form onSubmit={e => { e.preventDefault(); navigate(); }} className="flex-1 flex gap-2">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Enter URL to browse via Playwright agent..."
            className="flex-1 bg-white/5 border border-[var(--border)] rounded-lg px-4 py-1.5 text-sm text-white placeholder:text-[var(--text-subtle)] outline-none focus:border-brand-500 transition-colors"
          />
          <button type="submit" disabled={!url.trim() || isLoading} className="btn-primary text-sm py-1.5">
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {isLoading ? 'Loading...' : 'Go'}
          </button>
        </form>
        {result && (
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-[var(--text-muted)]">
            <ExternalLink size={14} />
          </a>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* History Sidebar */}
        <aside className="w-48 shrink-0 border-r border-[var(--border)] bg-[rgba(5,5,16,0.4)] flex flex-col">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">History</span>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {history.length === 0 ? (
              <div className="text-xs text-[var(--text-subtle)] px-3 py-4 text-center">No history yet</div>
            ) : history.map((h, i) => (
              <button
                key={i}
                onClick={() => { setUrl(h.url); }}
                className="flex items-start gap-2 w-full px-3 py-2 hover:bg-white/5 text-left transition-colors"
              >
                <Link size={11} className="text-brand-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs text-white truncate">{h.title}</div>
                  <div className="text-[10px] text-[var(--text-subtle)] truncate">{h.url}</div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {!result && !isLoading && !error && (
            <div className="h-full flex flex-col items-center justify-center text-[var(--text-subtle)]">
              <Monitor size={48} className="text-brand-600/20 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Playwright Browser Agent</h3>
              <p className="text-sm text-center max-w-md mb-6">
                Enter a URL above to browse the web using the headless Playwright browser. 
                The agent extracts text content and links for analysis.
              </p>
              <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                {['https://news.ycombinator.com', 'https://github.com/trending', 'https://reddit.com', 'https://wikipedia.org'].map(u => (
                  <button key={u} onClick={() => { setUrl(u); }} className="glass rounded-xl p-3 text-xs text-brand-300 hover:text-brand-200 hover:bg-brand-600/10 transition-colors text-left">
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isLoading && (
            <div className="h-full flex flex-col items-center justify-center text-[var(--text-subtle)]">
              <Loader2 size={32} className="animate-spin text-brand-400 mb-4" />
              <p className="text-sm">Navigating via Playwright agent...</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Navigation Error</div>
                <div className="text-sm mt-1 text-red-300">{error}</div>
              </div>
            </div>
          )}

          {result && (
            <div className="max-w-3xl space-y-6">
              {/* Page Info */}
              <div className="glass rounded-2xl p-5">
                <h1 className="text-xl font-bold text-white mb-1">{result.title}</h1>
                <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-brand-400 text-sm hover:underline">{result.url}</a>
              </div>

              {/* Extracted Text */}
              <div className="glass rounded-2xl p-5">
                <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <Globe size={16} className="text-brand-400" /> Page Content
                </h2>
                <div className="text-sm text-[var(--text-muted)] leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap">
                  {result.text || '(No text extracted)'}
                </div>
              </div>

              {/* Links */}
              {result.links?.length > 0 && (
                <div className="glass rounded-2xl p-5">
                  <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <Link size={16} className="text-brand-400" /> Links ({result.links.length})
                  </h2>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {result.links.map((link, i) => (
                      <button key={i} onClick={() => setUrl(link.href)} className="flex items-center gap-2 w-full text-left hover:bg-white/5 p-2 rounded-lg transition-colors">
                        <ExternalLink size={12} className="text-brand-400 shrink-0" />
                        <span className="text-sm text-brand-300 truncate">{link.text || link.href}</span>
                        <span className="text-xs text-[var(--text-subtle)] truncate ml-auto">{link.href}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
