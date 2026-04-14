import { NextRequest, NextResponse } from 'next/server';
import { loadSettings } from '@/lib/data';
import { evaluateToolPermission, getTool } from '@/lib/tools';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body.code || '');

    if (!code.trim()) {
      return NextResponse.json({ success: false, error: 'Code is required.' }, { status: 400 });
    }

    const settings = loadSettings();
    const permission = evaluateToolPermission({
      safeMode: settings.safeMode,
      toolName: 'run_code',
      args: { code },
      approved: false,
    });

    if (!permission.allowed) {
      return NextResponse.json({ success: false, error: permission.reason }, { status: 403 });
    }

    const tool = getTool('run_code');
    if (!tool) {
      return NextResponse.json({ success: false, error: 'run_code tool is not available.' }, { status: 500 });
    }

    const result = await tool.execute({ code });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
