import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import type { LLMTool } from './providers';
import {
  createCronRecord,
  createTaskRecord,
  createTeamRecord,
  deleteCronRecord,
  deleteTeamRecord,
  getTaskRecord,
  listCronRecords,
  listTaskRecords,
  listTeamRecords,
  normalizeTaskStatus,
  stopTaskRecord,
  updateTaskRecord,
} from './runtime-registry';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const DATA_DIR = process.env.TAKEOVER_DATA_DIR || path.join(process.cwd(), '.takeover-data');
const WORKSPACE = path.join(DATA_DIR, 'workspace');
const CHROME_PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');

// ─── Tool registry ────────────────────────────────────────────────────────────
export interface Tool {
  definition: LLMTool;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface ToolPermissionInput {
  safeMode: boolean;
  toolName: string;
  args: Record<string, unknown>;
  approved?: boolean;
}

export interface ToolPermissionDecision {
  allowed: boolean;
  reason: string;
}

const SAFE_MODE_GATED_TOOLS = new Set([
  'write_file',
  'run_command',
  'run_code',
]);

const DANGEROUS_COMMAND_PATTERNS: RegExp[] = [
  /(^|\s)rm\s+-rf(\s|$)/i,
  /(^|\s)del\s+\/f/i,
  /remove-item\s+-recurse\s+-force/i,
  /(^|\s)format(\s|$)/i,
  /(^|\s)mkfs(\.|\s|$)/i,
  /(^|\s)shutdown(\s|$)/i,
  /(^|\s)reboot(\s|$)/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\};\s*:/,
  /(^|\s)dd\s+if=/i,
];

const HIGH_RISK_CODE_PATTERNS: RegExp[] = [
  /require\(['"]child_process['"]\)/,
  /import\s+.*from\s+['"]child_process['"]/
];

export function validateCommandSafety(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) {
    return 'Command is empty.';
  }

  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'Command blocked by safety policy (destructive pattern detected).';
    }
  }

  return null;
}

export function evaluateToolPermission(input: ToolPermissionInput): ToolPermissionDecision {
  const { safeMode, toolName, args, approved } = input;

  if (toolName === 'run_command') {
    const command = String(args.command || '');
    const commandIssue = validateCommandSafety(command);
    if (commandIssue) {
      return { allowed: false, reason: commandIssue };
    }
  }

  if (toolName === 'run_code') {
    const code = String(args.code || '');
    for (const pattern of HIGH_RISK_CODE_PATTERNS) {
      if (pattern.test(code)) {
        return {
          allowed: false,
          reason: 'Code execution blocked by safety policy (high-risk module access).',
        };
      }
    }
  }

  if (!safeMode) {
    return { allowed: true, reason: 'allowed' };
  }

  if (approved) {
    return { allowed: true, reason: 'approved' };
  }

  if (SAFE_MODE_GATED_TOOLS.has(toolName)) {
    return {
      allowed: false,
      reason: `Safe Mode blocked ${toolName}. Approve this tool in-session to continue.`,
    };
  }

  if (toolName === 'browser_action' && String(args.action || '') === 'click') {
    return {
      allowed: false,
      reason: 'Safe Mode blocked browser click action. Use navigate/extract or approve this tool.',
    };
  }

  return { allowed: true, reason: 'allowed' };
}

function safeJoin(base: string, userPath: string): string {
  const resolved = path.resolve(base, userPath.replace(/^~/, os.homedir()));
  const normalizedBase = path.resolve(base);
  if (!resolved.startsWith(normalizedBase)) {
    throw new Error(`Path escapes workspace: ${userPath}`);
  }
  return resolved;
}

function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

// ─── Built-in tools ───────────────────────────────────────────────────────────
const tools: Record<string, Tool> = {

  read_file: {
    definition: {
      name: 'read_file',
      description: 'Read the contents of a file. Supports text files up to 1MB.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative file path to read' },
        },
        required: ['path'],
      },
    },
    async execute({ path: filePath }) {
      try {
        const resolved = safeJoin(WORKSPACE, String(filePath));
        if (!fs.existsSync(resolved)) {
          // Try absolute path as fallback
          if (fs.existsSync(String(filePath))) {
            const content = fs.readFileSync(String(filePath), 'utf-8');
            return content.slice(0, 100_000);
          }
          return `Error: File not found: ${filePath}`;
        }
        const content = fs.readFileSync(resolved, 'utf-8');
        return content.slice(0, 100_000);
      } catch (e) {
        return `Error reading file: ${(e as Error).message}`;
      }
    },
  },

  write_file: {
    definition: {
      name: 'write_file',
      description: 'Write content to a file, creating parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'File path to write to' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
    async execute({ path: filePath, content }) {
      try {
        const resolved = safeJoin(WORKSPACE, String(filePath));
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, String(content), 'utf-8');
        return `✅ Written ${String(content).length} bytes to ${resolved}`;
      } catch (e) {
        return `Error writing file: ${(e as Error).message}`;
      }
    },
  },

  list_directory: {
    definition: {
      name: 'list_directory',
      description: 'List files and directories at a given path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list (default: workspace root)' },
        },
      },
    },
    async execute({ path: dirPath = '.' }) {
      try {
        const resolved = safeJoin(WORKSPACE, String(dirPath));
        if (!fs.existsSync(resolved)) return `Error: Directory not found: ${dirPath}`;
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const lines = entries.map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`);
        return lines.join('\n') || '(empty directory)';
      } catch (e) {
        return `Error listing directory: ${(e as Error).message}`;
      }
    },
  },

  run_command: {
    definition: {
      name: 'run_command',
      description: 'Run a shell command and return its output. Use with caution.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' },
          cwd:     { type: 'string', description: 'Working directory (optional)' },
        },
        required: ['command'],
      },
    },
    async execute({ command, cwd }) {
      try {
        const commandText = String(command || '');
        const safetyIssue = validateCommandSafety(commandText);
        if (safetyIssue) {
          return `Error: ${safetyIssue}`;
        }

        const shell = process.platform === 'win32' ? 'cmd' : 'sh';
        const flag  = process.platform === 'win32' ? '/c' : '-c';
        const workDir = cwd ? safeJoin(WORKSPACE, String(cwd)) : WORKSPACE;

        const { stdout, stderr } = await execFileAsync(shell, [flag, commandText], {
          cwd: workDir,
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
        });
        const out = [stdout, stderr].filter(Boolean).join('\n');
        return out.slice(0, 8000) || '(no output)';
      } catch (e: any) {
        return `Error: ${e.stderr || e.message}`.slice(0, 2000);
      }
    },
  },

  get_current_time: {
    definition: {
      name: 'get_current_time',
      description: 'Get the current date and time.',
      parameters: { type: 'object', properties: {} },
    },
    async execute() {
      return new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'long' });
    },
  },

  read_data_dir: {
    definition: {
      name: 'read_data_dir',
      description: 'List files in the Takeover data directory (settings, sessions, etc).',
      parameters: { type: 'object', properties: {} },
    },
    async execute() {
      try {
        const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
        return entries.map(e => `${e.isDirectory() ? '[DIR] ' : ''}${e.name}`).join('\n');
      } catch (e) {
        return `Error: ${(e as Error).message}`;
      }
    },
  },

  web_search: {
    definition: {
      name: 'web_search',
      description: 'Search the web for information. Returns a summary of search results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
    async execute({ query }) {
      // Fallback: DuckDuckGo instant answer API (no key required)
      try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(String(query))}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        const data = await res.json() as any;
        const abstract = data.AbstractText || data.Answer || '';
        const related = (data.RelatedTopics || [])
          .slice(0, 3)
          .map((t: any) => t.Text || '')
          .filter(Boolean)
          .join('\n• ');
        if (abstract) return `${abstract}${related ? '\n\nRelated:\n• ' + related : ''}`;
        return `No instant answer found for "${query}". Try a more specific search query, or use the browser skill for full web results.`;
      } catch (e) {
        return `Web search error: ${(e as Error).message}`;
      }
    },
  },

  run_code: {
    definition: {
      name: 'run_code',
      description: 'Run arbitrary Node.js code in a sandboxed child process (15s timeout).',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Node.js code to execute' },
        },
        required: ['code'],
      },
    },
    async execute({ code }) {
      const source = String(code || '');
      if (!source.trim()) {
        return 'Execution error: no code provided.';
      }

      // Security checks bypassed (Alternative mode selected)

      let tmpFile = '';
      try {
        tmpFile = path.join(os.tmpdir(), `takeover_code_${Date.now()}.js`);
        fs.writeFileSync(tmpFile, source, 'utf-8');

        const command = `node ${shellQuote(tmpFile)}`;
        const { stdout, stderr } = await execAsync(command, {
          timeout: 15_000,
          maxBuffer: 2 * 1024 * 1024,
        });

        return [stdout, stderr].filter(Boolean).join('\n').slice(0, 8000) || '(No output)';
      } catch (e: any) {
        return `Execution error: ${e.stderr || e.message}`.slice(0, 3000);
      } finally {
        if (tmpFile && fs.existsSync(tmpFile)) {
          try {
            fs.unlinkSync(tmpFile);
          } catch {
            // noop
          }
        }
      }
    },
  },

  task_create: {
    definition: {
      name: 'task_create',
      description: 'Create a task in the runtime task registry.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Optional task description' },
          teamId: { type: 'string', description: 'Optional team id' },
        },
        required: ['title'],
      },
    },
    async execute({ title, description, teamId }) {
      const task = createTaskRecord({
        title: String(title || 'Untitled Task'),
        description: description ? String(description) : undefined,
        teamId: teamId ? String(teamId) : undefined,
      });
      return JSON.stringify(task, null, 2);
    },
  },

  task_get: {
    definition: {
      name: 'task_get',
      description: 'Get a task by id from the runtime task registry.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task id' },
        },
        required: ['id'],
      },
    },
    async execute({ id }) {
      const task = getTaskRecord(String(id || ''));
      if (!task) return 'Task not found.';
      return JSON.stringify(task, null, 2);
    },
  },

  task_list: {
    definition: {
      name: 'task_list',
      description: 'List tasks from the runtime task registry.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Optional task status filter' },
        },
      },
    },
    async execute({ status }) {
      const desiredStatus = status ? normalizeTaskStatus(String(status)) : null;
      const tasks = listTaskRecords().filter((t) => !desiredStatus || t.status === desiredStatus);
      return JSON.stringify(tasks, null, 2);
    },
  },

  task_update: {
    definition: {
      name: 'task_update',
      description: 'Update task status or result in runtime task registry.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task id' },
          status: { type: 'string', description: 'Task status' },
          result: { type: 'string', description: 'Optional result text' },
          error: { type: 'string', description: 'Optional error text' },
        },
        required: ['id'],
      },
    },
    async execute({ id, status, result, error }) {
      const task = updateTaskRecord(String(id || ''), {
        status: status ? normalizeTaskStatus(String(status)) : undefined,
        result: result ? String(result) : undefined,
        error: error ? String(error) : undefined,
      });
      if (!task) return 'Task not found.';
      return JSON.stringify(task, null, 2);
    },
  },

  task_stop: {
    definition: {
      name: 'task_stop',
      description: 'Stop/cancel a task in the runtime task registry.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task id' },
        },
        required: ['id'],
      },
    },
    async execute({ id }) {
      const task = stopTaskRecord(String(id || ''));
      if (!task) return 'Task not found.';
      return JSON.stringify(task, null, 2);
    },
  },

  task_output: {
    definition: {
      name: 'task_output',
      description: 'Read output lines from a task.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task id' },
        },
        required: ['id'],
      },
    },
    async execute({ id }) {
      const task = getTaskRecord(String(id || ''));
      if (!task) return 'Task not found.';
      return task.output.join('\n') || '(no task output yet)';
    },
  },

  team_create: {
    definition: {
      name: 'team_create',
      description: 'Create a team in runtime registry.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Team name' },
          members: { type: 'string', description: 'Comma-separated list of members' },
        },
        required: ['name'],
      },
    },
    async execute({ name, members }) {
      const list = String(members || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
      const team = createTeamRecord({ name: String(name || 'Untitled Team'), members: list });
      return JSON.stringify(team, null, 2);
    },
  },

  team_list: {
    definition: {
      name: 'team_list',
      description: 'List teams from runtime registry.',
      parameters: { type: 'object', properties: {} },
    },
    async execute() {
      return JSON.stringify(listTeamRecords(), null, 2);
    },
  },

  team_delete: {
    definition: {
      name: 'team_delete',
      description: 'Delete a team by id in runtime registry.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Team id' },
        },
        required: ['id'],
      },
    },
    async execute({ id }) {
      deleteTeamRecord(String(id || ''));
      return 'Team deleted.';
    },
  },

  cron_create: {
    definition: {
      name: 'cron_create',
      description: 'Create a cron job record in runtime registry.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Cron name' },
          schedule: { type: 'string', description: 'Cron expression, e.g. 0 * * * *' },
          prompt: { type: 'string', description: 'Prompt to run' },
          target: { type: 'string', description: 'Target surface: dashboard or telegram', enum: ['dashboard', 'telegram'] },
        },
        required: ['name', 'schedule', 'prompt'],
      },
    },
    async execute({ name, schedule, prompt, target }) {
      const cron = createCronRecord({
        name: String(name || 'Untitled Cron'),
        schedule: String(schedule || '0 * * * *'),
        prompt: String(prompt || ''),
        target: target === 'telegram' ? 'telegram' : 'dashboard',
        enabled: true,
      });
      return JSON.stringify(cron, null, 2);
    },
  },

  cron_list: {
    definition: {
      name: 'cron_list',
      description: 'List cron jobs from runtime registry.',
      parameters: { type: 'object', properties: {} },
    },
    async execute() {
      return JSON.stringify(listCronRecords(), null, 2);
    },
  },

  cron_delete: {
    definition: {
      name: 'cron_delete',
      description: 'Delete a cron job by id in runtime registry.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Cron id' },
        },
        required: ['id'],
      },
    },
    async execute({ id }) {
      deleteCronRecord(String(id || ''));
      return 'Cron deleted.';
    },
  },

  generate_image: {
    definition: {
      name: 'generate_image',
      description: 'Generate an image using DALL-E or a configured local provider.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed prompt for the image' },
          model: { type: 'string', description: 'Optional image model override (default: dall-e-3)' },
          size: { type: 'string', description: 'Optional image size (default: 1024x1024)' },
        },
        required: ['prompt'],
      },
    },
    async execute({ prompt, model, size }) {
      try {
        const apiKey = process.env.OPENAI_API_KEY;
        const requestedModel = String(model || process.env.IMAGE_MODEL || process.env.OLLAMA_MODEL || 'dall-e-3');
        const requestedSize = String(size || '1024x1024');

        if (!apiKey) {
          return `Image generation error: missing OPENAI_API_KEY (requested model: ${requestedModel}).`;
        }

        const res = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: requestedModel,
            prompt: String(prompt),
            size: requestedSize,
            response_format: 'b64_json',
          }),
        });

        const data = (await res.json()) as any;
        if (!res.ok || data?.error) {
          throw new Error(data?.error?.message || `OpenAI image API returned ${res.status}`);
        }

        const b64 = data?.data?.[0]?.b64_json;
        if (!b64) {
          throw new Error('No image payload returned by provider.');
        }

        return `data:image/png;base64,${b64}`;
      } catch (e) {
        return `Image generation error: ${(e as Error).message}`;
      }
    },
  },

  browser_action: {
     definition: {
       name: 'browser_action',
       description: 'Persistent Playwright browser action for navigate/click/extract over real DOM.',
       parameters: {
         type: 'object',
         properties: {
           action: { type: 'string', description: 'Action: navigate | click | extract', enum: ['navigate', 'click', 'extract'] },
           url: { type: 'string', description: 'URL to navigate to (for navigate)' },
           selector: { type: 'string', description: 'CSS selector target (for click/extract)' },
           waitForSelector: { type: 'string', description: 'Optional selector to wait for before extracting' }
         },
         required: ['action']
       }
     },
     async execute({ action, url, selector, waitForSelector }) {
       try {
          fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });

          const { chromium } = await import('playwright-core');
          const context = await chromium.launchPersistentContext(CHROME_PROFILE_DIR, {
            headless: true,
          });

          const page = context.pages()[0] || (await context.newPage());
          const actionType = String(action);

          if (actionType === 'navigate') {
            if (!url) {
              await context.close();
              return 'Browser error: url is required for navigate action.';
            }
            await page.goto(String(url), { waitUntil: 'domcontentloaded', timeout: 20000 });
          } else if (actionType === 'click') {
            if (!selector) {
              await context.close();
              return 'Browser error: selector is required for click action.';
            }
            await page.click(String(selector), { timeout: 10000 });
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
          }

          if (waitForSelector) {
            await page.waitForSelector(String(waitForSelector), { timeout: 10000 });
          }

          const pageData = await page.evaluate((extractSelector) => {
            const root = extractSelector ? document.querySelector(extractSelector) : document.body;
            const text = (root?.textContent || '').replace(/\s+/g, ' ').trim();
            const links = Array.from((root || document).querySelectorAll('a[href]'))
              .slice(0, 25)
              .map((a) => ({
                text: (a.textContent || '').trim(),
                href: (a as HTMLAnchorElement).href,
              }));

            return {
              title: document.title,
              url: location.href,
              text: text.slice(0, 8000),
              links,
            };
          }, selector ? String(selector) : undefined);

          await context.close();
          return JSON.stringify(pageData, null, 2);
       } catch (e: any) {
         return `Browser error: ${e?.message || 'unknown error'}`;
       }
     }
  }
};

// ─── Get available tools (filtered by enabled skills) ─────────────────────────
export function getAvailableTools(_enabledSkillIds?: string[]): Tool[] {
  // Always include core tools
  const coreTools = [
    'read_file',
    'write_file',
    'list_directory',
    'run_command',
    'get_current_time',
    'read_data_dir',
    'task_create',
    'task_get',
    'task_list',
    'task_update',
    'task_stop',
    'task_output',
    'team_create',
    'team_list',
    'team_delete',
    'cron_create',
    'cron_list',
    'cron_delete',
  ];
  const skillTools: Record<string, string[]> = {
    web_search: ['web_search'],
    code_exec: ['run_code'],
    image_gen: ['generate_image'],
    browser: ['browser_action'],
  };

  const available: Tool[] = coreTools.map(id => tools[id]).filter(Boolean);

  if (_enabledSkillIds) {
    for (const skillId of _enabledSkillIds) {
      const toolIds = skillTools[skillId] || [];
      for (const toolId of toolIds) {
        if (tools[toolId] && !available.includes(tools[toolId])) {
          available.push(tools[toolId]);
        }
      }
    }
  }

  return available;
}

export function getTool(name: string): Tool | undefined {
  return tools[name];
}

export function getAllTools(): Tool[] {
  return Object.values(tools);
}
