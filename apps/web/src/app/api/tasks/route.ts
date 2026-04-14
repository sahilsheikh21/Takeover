import { NextRequest, NextResponse } from 'next/server';
import {
  appendTaskOutput,
  createTaskRecord,
  deleteTaskRecord,
  getTaskRecord,
  listTaskRecords,
  normalizeTaskStatus,
  stopTaskRecord,
  toLegacyTaskStatus,
  updateTaskRecord,
} from '@/lib/runtime-registry';

export const runtime = 'nodejs';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  createdAt: number;
  updatedAt: number;
  result?: string;
}

function toLegacyTask(task: {
  id: string;
  title: string;
  description?: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  result?: string;
}): Task {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: toLegacyTaskStatus(normalizeTaskStatus(task.status)),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    result: task.result,
  };
}

export async function GET() {
  const tasks = listTaskRecords().map(toLegacyTask);
  return NextResponse.json({ success: true, tasks });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, title, description, status, result } = body;

    if (action === 'create') {
      const task = createTaskRecord({
        title: title || 'Untitled Task',
        description,
      });
      return NextResponse.json({ success: true, task: toLegacyTask(task) });
    }

    if (action === 'update') {
      const updated = updateTaskRecord(String(id), {
        status: status ? normalizeTaskStatus(String(status)) : undefined,
        result,
      });
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, task: toLegacyTask(updated) });
    }

    if (action === 'append_output') {
      const line = String(body.line || '');
      const updated = appendTaskOutput(String(id), line);
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, task: toLegacyTask(updated) });
    }

    if (action === 'get') {
      const task = getTaskRecord(String(id));
      if (!task) {
        return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        task: toLegacyTask(task),
        output: task.output,
      });
    }

    if (action === 'stop') {
      const task = stopTaskRecord(String(id));
      if (!task) {
        return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, task: toLegacyTask(task) });
    }

    if (action === 'delete') {
      deleteTaskRecord(String(id));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
