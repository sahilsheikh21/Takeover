import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, loadSkills, appendMessage, generateId } from '@/lib/data';
import { runAgentNonStreaming } from '@/lib/agent';
import type { Message } from '@/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, telegramChatId, telegramUserName } = body as {
      message: string;
      telegramChatId: string;
      telegramUserName?: string;
    };

    if (!message?.trim()) {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }

    const settings = loadSettings();
    const skillState = loadSkills();
    const enabledSkillIds = Object.entries(skillState.skills)
      .filter(([, s]) => s.enabled)
      .map(([id]) => id);

    // We use a shared sessionId per telegramChatId for continuous context
    const sid = `tg_${telegramChatId}`;

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
      source: 'telegram',
      telegramChatId,
      telegramUserName,
    };
    
    appendMessage(sid, userMsg);

    // Run the agent non-streaming
    const result = await runAgentNonStreaming(message, {
      settings,
      enabledSkillIds,
      // Load previous context
      sessionMessages: loadSession(sid)?.messages || [],
    });

    const assistantMsg: Message = {
      id: generateId(),
      role: 'assistant',
      content: result.response,
      timestamp: Date.now(),
      source: 'telegram',
      telegramChatId,
    };
    
    appendMessage(sid, assistantMsg);

    return NextResponse.json({ 
      success: true, 
      response: result.response,
      toolsUsed: result.toolsUsed
    });
    
  } catch (err) {
    console.error('Telegram Chat API Error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
