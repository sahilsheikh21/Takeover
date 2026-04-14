import { NextRequest, NextResponse } from 'next/server';
import {
  createApprovalRequest,
  decideApprovalRequest,
  listApprovals,
  listPendingApprovalsForSession,
} from '@/lib/runtime-registry';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('sessionId') || undefined;
    const status = req.nextUrl.searchParams.get('status') as 'pending' | 'approved' | 'denied' | null;
    const telegramChatId = req.nextUrl.searchParams.get('telegramChatId') || undefined;

    const approvals = listApprovals({
      sessionId,
      status: status || undefined,
      telegramChatId,
    });

    return NextResponse.json({ success: true, approvals });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'create') {
      const sessionId = String(body.sessionId || '');
      const source = body.source === 'telegram' ? 'telegram' : 'dashboard';
      const toolName = String(body.toolName || '');
      const args = (body.args || {}) as Record<string, unknown>;
      const reason = String(body.reason || 'Approval required');

      if (!sessionId || !toolName) {
        return NextResponse.json({ success: false, error: 'sessionId and toolName are required' }, { status: 400 });
      }

      const approval = createApprovalRequest({
        sessionId,
        source,
        toolName,
        args,
        reason,
        telegramChatId: body.telegramChatId ? String(body.telegramChatId) : undefined,
        telegramUserName: body.telegramUserName ? String(body.telegramUserName) : undefined,
      });

      return NextResponse.json({ success: true, approval });
    }

    if (action === 'approve' || action === 'deny') {
      const id = String(body.id || '');
      if (!id) {
        return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      }

      const approval = decideApprovalRequest({
        id,
        status: action === 'approve' ? 'approved' : 'denied',
        decisionBy: body.decisionBy ? String(body.decisionBy) : undefined,
      });

      if (!approval) {
        return NextResponse.json({ success: false, error: 'Approval not found' }, { status: 404 });
      }

      const pendingApprovals = listPendingApprovalsForSession(approval.sessionId);
      return NextResponse.json({ success: true, approval, pendingApprovals });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
