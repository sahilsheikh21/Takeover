import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDataDir } from './data';

export type TaskRegistryStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export interface TaskRecord {
  id: string;
  title: string;
  description?: string;
  status: TaskRegistryStatus;
  createdAt: number;
  updatedAt: number;
  result?: string;
  error?: string;
  output: string[];
  teamId?: string;
}

export interface TeamRecord {
  id: string;
  name: string;
  members: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CronJobRecord {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  target: 'dashboard' | 'telegram';
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
}

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  source: 'dashboard' | 'telegram';
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
  updatedAt: number;
  telegramChatId?: string;
  telegramUserName?: string;
  decisionBy?: string;
}

interface RuntimeRegistry {
  tasks: TaskRecord[];
  teams: TeamRecord[];
  cronJobs: CronJobRecord[];
  approvals: ApprovalRequest[];
}

const REGISTRY_DIR = path.join(getDataDir(), 'runtime');
const REGISTRY_FILE = path.join(REGISTRY_DIR, 'registry.json');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function defaultRegistry(): RuntimeRegistry {
  return {
    tasks: [],
    teams: [],
    cronJobs: [],
    approvals: [],
  };
}

function ensureRegistry(): void {
  ensureDir(REGISTRY_DIR);
  if (!fs.existsSync(REGISTRY_FILE)) {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(defaultRegistry(), null, 2), 'utf-8');
  }
}

function readRegistry(): RuntimeRegistry {
  ensureRegistry();
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<RuntimeRegistry>;
    return {
      tasks: parsed.tasks || [],
      teams: parsed.teams || [],
      cronJobs: parsed.cronJobs || [],
      approvals: parsed.approvals || [],
    };
  } catch {
    return defaultRegistry();
  }
}

function writeRegistry(registry: RuntimeRegistry): void {
  ensureRegistry();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
}

function now(): number {
  return Date.now();
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function normalizeTaskStatus(status: string | undefined): TaskRegistryStatus {
  switch (status) {
    case 'running':
    case 'in_progress':
      return 'in_progress';
    case 'done':
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'blocked':
      return 'blocked';
    case 'cancelled':
      return 'cancelled';
    case 'pending':
    default:
      return 'pending';
  }
}

export function toLegacyTaskStatus(status: TaskRegistryStatus): 'pending' | 'running' | 'done' | 'failed' {
  if (status === 'in_progress') return 'running';
  if (status === 'completed') return 'done';
  if (status === 'failed' || status === 'blocked' || status === 'cancelled') return 'failed';
  return 'pending';
}

export function createTaskRecord(input: {
  title: string;
  description?: string;
  teamId?: string;
}): TaskRecord {
  const registry = readRegistry();
  const ts = now();
  const task: TaskRecord = {
    id: makeId('task'),
    title: input.title || 'Untitled Task',
    description: input.description,
    teamId: input.teamId,
    status: 'pending',
    createdAt: ts,
    updatedAt: ts,
    output: [],
  };

  registry.tasks.unshift(task);
  writeRegistry(registry);
  return task;
}

export function listTaskRecords(): TaskRecord[] {
  return readRegistry().tasks.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getTaskRecord(id: string): TaskRecord | null {
  const task = readRegistry().tasks.find((t) => t.id === id);
  return task || null;
}

export function updateTaskRecord(
  id: string,
  patch: Partial<Pick<TaskRecord, 'status' | 'result' | 'error' | 'title' | 'description' | 'teamId'>>,
): TaskRecord | null {
  const registry = readRegistry();
  const idx = registry.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  const current = registry.tasks[idx];
  const next: TaskRecord = {
    ...current,
    status: patch.status ? normalizeTaskStatus(patch.status) : current.status,
    updatedAt: now(),
  };

  if (patch.title !== undefined) next.title = patch.title;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.teamId !== undefined) next.teamId = patch.teamId;
  if (patch.result !== undefined) next.result = patch.result;
  if (patch.error !== undefined) next.error = patch.error;

  registry.tasks[idx] = next;
  writeRegistry(registry);
  return next;
}

export function appendTaskOutput(id: string, line: string): TaskRecord | null {
  const registry = readRegistry();
  const idx = registry.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  registry.tasks[idx].output.push(line);
  registry.tasks[idx].updatedAt = now();
  writeRegistry(registry);
  return registry.tasks[idx];
}

export function deleteTaskRecord(id: string): void {
  const registry = readRegistry();
  registry.tasks = registry.tasks.filter((t) => t.id !== id);
  writeRegistry(registry);
}

export function stopTaskRecord(id: string): TaskRecord | null {
  return updateTaskRecord(id, { status: 'cancelled' });
}

export function createTeamRecord(input: { name: string; members?: string[] }): TeamRecord {
  const registry = readRegistry();
  const ts = now();
  const team: TeamRecord = {
    id: makeId('team'),
    name: input.name || 'Untitled Team',
    members: input.members || [],
    createdAt: ts,
    updatedAt: ts,
  };

  registry.teams.unshift(team);
  writeRegistry(registry);
  return team;
}

export function listTeamRecords(): TeamRecord[] {
  return readRegistry().teams.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteTeamRecord(id: string): void {
  const registry = readRegistry();
  registry.teams = registry.teams.filter((t) => t.id !== id);
  writeRegistry(registry);
}

export function createCronRecord(input: {
  name: string;
  schedule: string;
  prompt: string;
  target?: 'dashboard' | 'telegram';
  enabled?: boolean;
}): CronJobRecord {
  const registry = readRegistry();
  const ts = now();
  const cron: CronJobRecord = {
    id: makeId('cron'),
    name: input.name || 'Untitled Cron',
    schedule: input.schedule || '0 * * * *',
    prompt: input.prompt || '',
    target: input.target || 'dashboard',
    enabled: input.enabled ?? true,
    createdAt: ts,
    updatedAt: ts,
  };

  registry.cronJobs.unshift(cron);
  writeRegistry(registry);
  return cron;
}

export function listCronRecords(): CronJobRecord[] {
  return readRegistry().cronJobs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function updateCronRecord(
  id: string,
  patch: Partial<Pick<CronJobRecord, 'name' | 'schedule' | 'prompt' | 'target' | 'enabled' | 'lastRunAt'>>,
): CronJobRecord | null {
  const registry = readRegistry();
  const idx = registry.cronJobs.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  const current = registry.cronJobs[idx];
  const next: CronJobRecord = {
    ...current,
    updatedAt: now(),
  };

  if (patch.name !== undefined) next.name = patch.name;
  if (patch.schedule !== undefined) next.schedule = patch.schedule;
  if (patch.prompt !== undefined) next.prompt = patch.prompt;
  if (patch.target !== undefined) next.target = patch.target;
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.lastRunAt !== undefined) next.lastRunAt = patch.lastRunAt;

  registry.cronJobs[idx] = next;
  writeRegistry(registry);
  return next;
}

export function deleteCronRecord(id: string): void {
  const registry = readRegistry();
  registry.cronJobs = registry.cronJobs.filter((c) => c.id !== id);
  writeRegistry(registry);
}

export function createApprovalRequest(input: {
  sessionId: string;
  source: 'dashboard' | 'telegram';
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
  telegramChatId?: string;
  telegramUserName?: string;
}): ApprovalRequest {
  const registry = readRegistry();

  const existing = registry.approvals.find(
    (a) =>
      a.status === 'pending' &&
      a.sessionId === input.sessionId &&
      a.toolName === input.toolName &&
      JSON.stringify(a.args) === JSON.stringify(input.args),
  );

  if (existing) {
    return existing;
  }

  const ts = now();
  const approval: ApprovalRequest = {
    id: makeId('approval'),
    sessionId: input.sessionId,
    source: input.source,
    toolName: input.toolName,
    args: input.args,
    reason: input.reason,
    status: 'pending',
    createdAt: ts,
    updatedAt: ts,
    telegramChatId: input.telegramChatId,
    telegramUserName: input.telegramUserName,
  };

  registry.approvals.unshift(approval);
  writeRegistry(registry);
  return approval;
}

export function listApprovals(filter?: {
  sessionId?: string;
  status?: ApprovalRequest['status'];
  telegramChatId?: string;
}): ApprovalRequest[] {
  let approvals = readRegistry().approvals;

  if (filter?.sessionId) {
    approvals = approvals.filter((a) => a.sessionId === filter.sessionId);
  }
  if (filter?.status) {
    approvals = approvals.filter((a) => a.status === filter.status);
  }
  if (filter?.telegramChatId) {
    approvals = approvals.filter((a) => a.telegramChatId === filter.telegramChatId);
  }

  return approvals.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function listPendingApprovalsForSession(sessionId: string): ApprovalRequest[] {
  return listApprovals({ sessionId, status: 'pending' });
}

export function listPendingApprovalsForChat(chatId: string): ApprovalRequest[] {
  return listApprovals({ telegramChatId: chatId, status: 'pending' });
}

export function decideApprovalRequest(input: {
  id: string;
  status: 'approved' | 'denied';
  decisionBy?: string;
}): ApprovalRequest | null {
  const registry = readRegistry();
  const idx = registry.approvals.findIndex((a) => a.id === input.id);
  if (idx === -1) return null;

  registry.approvals[idx] = {
    ...registry.approvals[idx],
    status: input.status,
    decisionBy: input.decisionBy,
    updatedAt: now(),
  };

  writeRegistry(registry);
  return registry.approvals[idx];
}

export function listApprovedToolNamesForSession(sessionId: string): string[] {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const threshold = now() - oneDayMs;
  const names = new Set(
    readRegistry()
      .approvals
      .filter((a) => a.sessionId === sessionId && a.status === 'approved' && a.updatedAt >= threshold)
      .map((a) => a.toolName),
  );

  return Array.from(names);
}
