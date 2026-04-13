import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const DATA_DIR = process.env.TAKEOVER_DATA_DIR || path.join(process.cwd(), '.takeover-data');
const WORKSPACE = path.join(DATA_DIR, 'workspace');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function listFilesRecursive(dir: string, base: string = dir): Array<{ name: string; path: string; isDir: boolean; size?: number }> {
  ensureDir(dir);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: Array<{ name: string; path: string; isDir: boolean; size?: number }> = [];
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(base, abs);
    if (e.isDirectory()) {
      results.push({ name: e.name, path: rel, isDir: true });
      results.push(...listFilesRecursive(abs, base));
    } else {
      const stat = fs.statSync(abs);
      results.push({ name: e.name, path: rel, isDir: false, size: stat.size });
    }
  }
  return results;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get('path');

  if (filePath) {
    try {
      const abs = path.resolve(WORKSPACE, filePath);
      if (!abs.startsWith(path.resolve(WORKSPACE))) {
        return NextResponse.json({ success: false, error: 'Path escape blocked' }, { status: 403 });
      }
      const content = fs.readFileSync(abs, 'utf-8');
      return NextResponse.json({ success: true, content, path: filePath });
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error).message }, { status: 404 });
    }
  }

  const files = listFilesRecursive(WORKSPACE);
  return NextResponse.json({ success: true, files, workspace: WORKSPACE });
}

export async function POST(req: Request) {
  try {
    const { path: filePath, content } = await req.json();
    const abs = path.resolve(WORKSPACE, filePath);
    if (!abs.startsWith(path.resolve(WORKSPACE))) {
      return NextResponse.json({ success: false, error: 'Path escape blocked' }, { status: 403 });
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
