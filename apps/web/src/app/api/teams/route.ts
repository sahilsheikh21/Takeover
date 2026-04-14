import { NextRequest, NextResponse } from 'next/server';
import {
  createTeamRecord,
  deleteTeamRecord,
  listTeamRecords,
} from '@/lib/runtime-registry';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const teams = listTeamRecords();
    return NextResponse.json({ success: true, teams });
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
    const action = String(body.action || 'create');

    if (action === 'create') {
      const team = createTeamRecord({
        name: String(body.name || 'Untitled Team'),
        members: Array.isArray(body.members) ? body.members.map(String) : [],
      });
      return NextResponse.json({ success: true, team });
    }

    if (action === 'delete') {
      const id = String(body.id || '');
      if (!id) {
        return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      }
      deleteTeamRecord(id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
