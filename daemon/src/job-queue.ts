import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { InternId, JobPhase } from './types.js';

export type JobStatus = 'queued' | 'running' | 'needs_approval' | 'done' | 'error';

export interface JobRecord {
  readonly id: string;
  readonly goal: string;
  readonly createdAt: number;
  status: JobStatus;
  phase: JobPhase;
  intern: InternId | null;
  lastMessage: string;
  error?: string;
}

const jobs = new Map<string, JobRecord>();

export function loadJobsFromDisk(path: string): void {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const j = JSON.parse(line) as JobRecord;
      jobs.set(j.id, j);
    } catch {
      /* skip bad line */
    }
  }
}

export function persistJob(path: string, job: JobRecord): void {
  appendFileSync(path, `${JSON.stringify(job)}\n`, 'utf-8');
}

export function rewriteQueue(path: string, all: Iterable<JobRecord>): void {
  const lines = [...all].map((j) => JSON.stringify(j)).join('\n');
  writeFileSync(path, lines ? `${lines}\n` : '', 'utf-8');
}

export function createJob(goal: string): JobRecord {
  const job: JobRecord = {
    id: randomUUID(),
    goal,
    createdAt: Date.now(),
    status: 'queued',
    phase: 'idle',
    intern: null,
    lastMessage: '',
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): JobRecord | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<JobRecord>): JobRecord | undefined {
  const j = jobs.get(id);
  if (!j) return undefined;
  const next = { ...j, ...patch };
  jobs.set(id, next);
  return next;
}

export function allJobs(): JobRecord[] {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}
