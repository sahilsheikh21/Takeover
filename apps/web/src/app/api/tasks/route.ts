import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';

const DATA_DIR = process.env.TAKEOVER_DATA_DIR || path.join(os.homedir(), '.takeover-data');
const TASKS_FILE = path.join(DATA_DIR, 'memory', 'tasks.json');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  createdAt: number;
  updatedAt: number;
  result?: string;
}

function loadTasks(): Task[] {
  try {
    if (fs.existsSync(TASKS_FILE)) return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
  } catch {}
  return [];
}

function saveTasks(tasks: Task[]): void {
  ensureDir(path.dirname(TASKS_FILE));
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
}

export async function GET() {
  return NextResponse.json({ success: true, tasks: loadTasks() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, title, description, status, result } = body;

    const tasks = loadTasks();

    if (action === 'create') {
      const task: Task = {
        id: `task_${Date.now()}`,
        title: title || 'Untitled Task',
        description,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.unshift(task);
      saveTasks(tasks);
      return NextResponse.json({ success: true, task });
    }

    if (action === 'update') {
      const idx = tasks.findIndex(t => t.id === id);
      if (idx === -1) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
      if (status) tasks[idx].status = status;
      if (result !== undefined) tasks[idx].result = result;
      tasks[idx].updatedAt = Date.now();
      saveTasks(tasks);
      return NextResponse.json({ success: true, task: tasks[idx] });
    }

    if (action === 'delete') {
      const filtered = tasks.filter(t => t.id !== id);
      saveTasks(filtered);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
