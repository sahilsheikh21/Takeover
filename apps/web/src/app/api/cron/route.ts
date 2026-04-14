import { NextRequest, NextResponse } from 'next/server';
import {
  createCronRecord,
  deleteCronRecord,
  listCronRecords,
  updateCronRecord,
} from '@/lib/runtime-registry';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const cronJobs = listCronRecords();
    return NextResponse.json({ success: true, cronJobs });
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
      const cron = createCronRecord({
        name: String(body.name || 'Untitled Cron'),
        schedule: String(body.schedule || '0 * * * *'),
        prompt: String(body.prompt || ''),
        target: body.target === 'telegram' ? 'telegram' : 'dashboard',
        enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
      });
      return NextResponse.json({ success: true, cron });
    }

    if (action === 'update') {
      const id = String(body.id || '');
      if (!id) {
        return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      }

      const cron = updateCronRecord(id, {
        name: body.name ? String(body.name) : undefined,
        schedule: body.schedule ? String(body.schedule) : undefined,
        prompt: body.prompt ? String(body.prompt) : undefined,
        target: body.target === 'telegram' ? 'telegram' : body.target === 'dashboard' ? 'dashboard' : undefined,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      });

      if (!cron) {
        return NextResponse.json({ success: false, error: 'Cron not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true, cron });
    }

    if (action === 'delete') {
      const id = String(body.id || '');
      if (!id) {
        return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      }

      deleteCronRecord(id);
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
