import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  appendMessage,
  generateId,
  getDataDir,
  loadSession,
  loadSettings,
  loadSkills,
} from '@/lib/data';
import { runAgentNonStreaming } from '@/lib/agent';
import type { Message } from '@/types';
import {
  createApprovalRequest,
  listApprovedToolNamesForSession,
  listPendingApprovalsForSession,
} from '@/lib/runtime-registry';

export const runtime = 'nodejs';

function persistGeneratedImagesFromText(responseText: string): Array<{ type: 'image'; filepath: string }> {
  const matches = responseText.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\n\r]+/g) || [];
  if (matches.length === 0) return [];

  const imageDir = path.join(getDataDir(), 'workspace', 'images');
  fs.mkdirSync(imageDir, { recursive: true });

  const saved: Array<{ type: 'image'; filepath: string }> = [];

  for (const dataUri of matches.slice(0, 3)) {
    const commaIndex = dataUri.indexOf(',');
    if (commaIndex === -1) continue;

    const base64 = dataUri.slice(commaIndex + 1).replace(/\s+/g, '');
    if (!base64) continue;

    const fileName = `tg_generated_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`;
    const filePath = path.join(imageDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    saved.push({ type: 'image', filepath: filePath });
  }

  return saved;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, telegramChatId, telegramUserName, imageDataUri } = body as {
      message: string;
      telegramChatId: string;
      telegramUserName?: string;
      imageDataUri?: string;
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
    const approvedTools = listApprovedToolNamesForSession(sid);

    const previousSessionMessages = loadSession(sid)?.messages || [];

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: imageDataUri ? `[Image attached]\n${message}` : message,
      timestamp: Date.now(),
      source: 'telegram',
      telegramChatId,
      telegramUserName,
    };
    
    appendMessage(sid, userMsg);

    // Run the agent non-streaming
    const result = await runAgentNonStreaming(userMsg.content, {
      settings,
      enabledSkillIds,
      approvedTools,
      // Provide prior context only; this request's user message is appended by runAgent.
      sessionMessages: previousSessionMessages,
      onToolBlocked: (name, reason, args) => {
        if (reason.includes('Safe Mode blocked')) {
          createApprovalRequest({
            sessionId: sid,
            source: 'telegram',
            toolName: name,
            args,
            reason,
            telegramChatId,
            telegramUserName,
          });
        }
      },
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

    const pendingApprovals = listPendingApprovalsForSession(sid);
    const generatedMedia = persistGeneratedImagesFromText(result.response);

    return NextResponse.json({ 
      success: true, 
      response: result.response,
      toolsUsed: result.toolsUsed,
      blockedTools: result.blockedTools,
      totalToolCalls: result.totalToolCalls,
      steps: result.steps,
      pendingApprovals,
      generatedMedia,
    });
    
  } catch (err) {
    console.error('Telegram Chat API Error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
