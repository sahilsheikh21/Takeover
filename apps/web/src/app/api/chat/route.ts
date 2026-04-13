import { NextRequest } from 'next/server';
import { loadSettings, loadSkills, appendMessage, generateId, loadSession } from '@/lib/data';
import { runAgent } from '@/lib/agent';
import type { Message } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      try {
        const body = await req.json();
        const { message, sessionId, imageDataUri } = body as {
          message: string;
          sessionId?: string;
          imageDataUri?: string;
        };

        if (!message?.trim()) {
          send('error', { error: 'Message is required' });
          controller.close();
          return;
        }

        const settings = loadSettings();
        const skillState = loadSkills();
        const enabledSkillIds = Object.entries(skillState.skills)
          .filter(([, s]) => s.enabled)
          .map(([id]) => id);

        const sid = sessionId || generateId();
        const previousSessionMessages = loadSession(sid)?.messages || [];

        // Build user message
        const userMsg: Message = {
          id: generateId(),
          role: 'user',
          content: imageDataUri ? `[Image attached]\n${message}` : message,
          timestamp: Date.now(),
          imageDataUri,
          source: 'dashboard',
        };

        // Save user message
        appendMessage(sid, userMsg);

        // Notify client about session + user message
        send('session', { sessionId: sid });
        send('userMessage', userMsg);

        let fullResponse = '';

        await runAgent(userMsg.content, {
          settings,
          enabledSkillIds,
          // Provide prior context only; the current user message is appended by runAgent.
          sessionMessages: previousSessionMessages,
          onText: (chunk) => {
            fullResponse += chunk;
            send('text', { chunk });
          },
          onToolStart: (name, args) => {
            send('toolStart', { name, args });
          },
          onToolEnd: (name, result) => {
            send('toolEnd', { name, result: result.slice(0, 500) });
          },
          onError: (err) => {
            send('error', { error: err });
          },
        });

        // Save assistant response
        const assistantMsg: Message = {
          id: generateId(),
          role: 'assistant',
          content: fullResponse,
          timestamp: Date.now(),
          source: 'dashboard',
        };
        appendMessage(sid, assistantMsg);

        send('done', { sessionId: sid, messageId: assistantMsg.id });
      } catch (err) {
        const e = err as Error;
        send('error', { error: e.message || 'Internal server error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
