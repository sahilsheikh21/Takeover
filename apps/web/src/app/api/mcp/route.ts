import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { loadSettings, saveSettings } from '@/lib/data';
import type { MCPServerConfig } from '@/types';

export const runtime = 'nodejs';

function toId(name: string): string {
  return String(name || 'mcp_server')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `mcp_${Date.now()}`;
}

function normalizeServer(input: Partial<MCPServerConfig>, index = 0): MCPServerConfig {
  const name = String(input.name || `MCP Server ${index + 1}`).trim();
  return {
    id: String(input.id || toId(name)),
    name,
    command: String(input.command || '').trim(),
    args: String(input.args || '').trim(),
    cwd: input.cwd ? String(input.cwd).trim() : undefined,
    enabled: Boolean(input.enabled),
    env: input.env && typeof input.env === 'object' ? input.env : undefined,
  };
}

function parseArgString(argLine: string): string[] {
  const args: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null = re.exec(argLine);
  while (match) {
    args.push(match[1] || match[2] || match[3]);
    match = re.exec(argLine);
  }
  return args;
}

async function testServer(server: MCPServerConfig): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    if (!server.command) {
      resolve({ ok: false, output: 'Missing command.' });
      return;
    }

    const args = parseArgString(server.args || '');
    const child = spawn(server.command, args, {
      cwd: server.cwd || process.cwd(),
      env: {
        ...process.env,
        ...(server.env || {}),
      },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const append = (chunk: Buffer | string) => {
      output += String(chunk);
      if (output.length > 4000) {
        output = output.slice(-4000);
      }
    };

    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    let settled = false;
    const finalize = (ok: boolean, message: string) => {
      if (settled) return;
      settled = true;
      resolve({ ok, output: `${message}${output ? `\n\n${output.trim()}` : ''}`.trim() });
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // noop
      }
      finalize(true, 'Process started successfully (terminated after MCP smoke-test timeout).');
    }, 4500);

    child.on('error', (err) => {
      clearTimeout(timer);
      finalize(false, `Failed to start process: ${err.message}`);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        finalize(true, 'Process exited cleanly during test.');
      } else {
        finalize(false, `Process exited with code ${code}.`);
      }
    });
  });
}

export async function GET() {
  try {
    const settings = loadSettings();
    return NextResponse.json({ success: true, servers: settings.mcpServers || [] });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || 'save');

    if (action === 'save') {
      const serversRaw = Array.isArray(body.servers) ? body.servers : [];
      const servers = serversRaw.map((item: Partial<MCPServerConfig>, index: number) => normalizeServer(item, index));
      const updated = saveSettings({ mcpServers: servers });
      return NextResponse.json({ success: true, servers: updated.mcpServers || [] });
    }

    if (action === 'test') {
      const server = normalizeServer((body.server || {}) as Partial<MCPServerConfig>);
      const result = await testServer(server);
      return NextResponse.json({ success: result.ok, output: result.output });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
