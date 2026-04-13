'use client';
import { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Send, Loader2, Download, Trash2, Sparkles, ZoomIn, X } from 'lucide-react';
import { consumeSSE } from '@/lib/sse';

interface GeneratedImage {
  id: string;
  prompt: string;
  url: string; // base64 data URI
  createdAt: number;
}

export default function StudioPage() {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [preview, setPreview] = useState<GeneratedImage | null>(null);

  // Load saved images from localStorage (client-side persistence)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('takeover_studio_images');
      if (saved) setImages(JSON.parse(saved));
    } catch {}
  }, []);

  function saveImages(imgs: GeneratedImage[]) {
    try { localStorage.setItem('takeover_studio_images', JSON.stringify(imgs.slice(0, 20))); } catch {}
  }

  async function generate() {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    const currentPrompt = prompt;
    setPrompt('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Use the generate_image tool to create an image with this prompt: "${currentPrompt}". Return only the base64 data URI from the tool result, nothing else.` }),
      });

      let dataUri = '';
      await consumeSSE(res.body, (event, data) => {
        const payload = typeof data === 'string' || data === null ? {} : data;
        if (event === 'toolEnd') {
          const result = String(payload.result || '');
          if (result.startsWith('data:image')) {
            dataUri = result;
          }
        }
      });

      if (dataUri) {
        const newImg: GeneratedImage = {
          id: `img_${Date.now()}`,
          prompt: currentPrompt,
          url: dataUri,
          createdAt: Date.now(),
        };
        const updated = [newImg, ...images];
        setImages(updated);
        saveImages(updated);
        setPreview(newImg);
      }
    } finally {
      setIsGenerating(false);
    }
  }

  function deleteImage(id: string) {
    const updated = images.filter(i => i.id !== id);
    setImages(updated);
    saveImages(updated);
    if (preview?.id === id) setPreview(null);
  }

  function downloadImage(img: GeneratedImage) {
    const a = document.createElement('a');
    a.href = img.url;
    a.download = `takeover_${img.id}.png`;
    a.click();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="h-16 shrink-0 flex items-center gap-3 px-6 border-b border-[var(--border)] bg-[rgba(10,10,31,0.6)]">
        <ImageIcon size={18} className="text-brand-400" />
        <h2 className="font-semibold text-white text-lg">Studio</h2>
        <span className="text-xs text-[var(--text-subtle)] ml-1">AI Image Generation</span>
        {images.length > 0 && (
          <span className="ml-auto text-xs text-[var(--text-subtle)]">{images.length} image{images.length !== 1 ? 's' : ''}</span>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Gallery */}
        <div className="flex-1 overflow-y-auto p-6">
          {images.length === 0 && !isGenerating ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--text-subtle)]">
              <Sparkles size={48} className="text-brand-600/20 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">AI Image Studio</h3>
              <p className="text-sm text-center max-w-sm mb-6">
                Generate stunning images using DALL-E or other AI image providers. 
                Configure your OpenAI API key in Settings first.
              </p>
              <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
                {[
                  'A futuristic city at night with neon lights',
                  'A serene mountain lake at sunset',
                  'Abstract digital art with vibrant colors',
                  'A cozy cabin in a snowy forest',
                ].map(p => (
                  <button key={p} onClick={() => setPrompt(p)} className="glass rounded-xl p-3 text-xs text-[var(--text-muted)] hover:text-white hover:bg-brand-600/10 transition-colors text-left">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {isGenerating && (
                <div className="aspect-square glass rounded-2xl flex flex-col items-center justify-center text-[var(--text-subtle)] border border-brand-500/30">
                  <Loader2 size={24} className="animate-spin text-brand-400 mb-2" />
                  <span className="text-xs">Generating...</span>
                </div>
              )}
              {images.map(img => (
                <div key={img.id} className="group relative aspect-square rounded-2xl overflow-hidden cursor-pointer bg-white/5" onClick={() => setPreview(img)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.prompt} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={e => { e.stopPropagation(); downloadImage(img); }} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 text-white">
                        <Download size={13} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteImage(img.id); }} className="p-1.5 bg-red-500/20 rounded-lg hover:bg-red-500/40 text-red-300">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="text-xs text-white line-clamp-3">{img.prompt}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview Panel */}
        {preview && (
          <aside className="w-64 shrink-0 border-l border-[var(--border)] bg-[rgba(5,5,16,0.6)] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <span className="text-sm font-medium text-white">Preview</span>
              <button onClick={() => setPreview(null)} className="text-[var(--text-subtle)] hover:text-white"><X size={14} /></button>
            </div>
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.url} alt={preview.prompt} className="w-full rounded-xl object-cover" />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1">Prompt</div>
                <p className="text-xs text-[var(--text-muted)]">{preview.prompt}</p>
              </div>
              <div className="text-[10px] text-[var(--text-subtle)]">{new Date(preview.createdAt).toLocaleString()}</div>
              <button onClick={() => downloadImage(preview)} className="btn-primary w-full text-sm">
                <Download size={14} /> Download
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Prompt Bar */}
      <div className="shrink-0 p-4 bg-[rgba(5,5,16,0.8)] border-t border-[var(--border)]">
        <form onSubmit={e => { e.preventDefault(); generate(); }} className="max-w-2xl mx-auto flex gap-3">
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate..."
            className="flex-1 bg-[rgba(15,15,46,0.6)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[var(--text-subtle)] outline-none focus:border-brand-500 transition-colors"
            disabled={isGenerating}
          />
          <button type="submit" disabled={!prompt.trim() || isGenerating} className="btn-primary px-5">
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </form>
      </div>
    </div>
  );
}
