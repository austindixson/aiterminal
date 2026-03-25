import type { Server, Socket } from 'node:net';
import { createServer } from 'node:net';
import OpenAI from 'openai';
import type { JobRecord } from './job-queue.js';
import { createJob, persistJob, updateJob } from './job-queue.js';
import { runAgentLoop } from './agent-loop.js';
import type { JobPhase } from './types.js';
import { QUEUE_FILE, getWorkspaceRoot } from './config.js';

export interface GatewayContext {
  readonly token: string;
  readonly openai: OpenAI;
  readonly queuePath: string;
}

const approvalResolvers = new Map<string, (ok: boolean) => void>();

function approvalKey(jobId: string, stepId: string): string {
  return `${jobId}:${stepId}`;
}

export function resolveApproval(jobId: string, stepId: string, ok: boolean): void {
  const fn = approvalResolvers.get(approvalKey(jobId, stepId));
  if (fn) {
    approvalResolvers.delete(approvalKey(jobId, stepId));
    fn(ok);
  }
}

export function startGatewayServer(
  port: number,
  ctx: GatewayContext,
): Server {
  return createServer((socket: Socket) => {
    let authenticated = false;
    let buf = '';

    const send = (obj: unknown) => {
      socket.write(`${JSON.stringify(obj)}\n`);
    };

    socket.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf-8');
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(line) as Record<string, unknown>;
        } catch {
          send({ type: 'error', message: 'invalid json' });
          continue;
        }

        if (!authenticated) {
          if (msg.type === 'auth' && msg.token === ctx.token) {
            authenticated = true;
            send({ type: 'auth_ok' });
          } else {
            send({ type: 'error', message: 'unauthorized' });
            socket.destroy();
          }
          continue;
        }

        if (msg.type === 'submit' && typeof msg.goal === 'string') {
          const job = createJob(msg.goal);
          persistJob(ctx.queuePath, job);
          send({ type: 'accepted', jobId: job.id });
          // Run job in background but catch errors
          runJob(job, socket, ctx).catch((err) => {
            console.error('[gateway] Job error:', err);
            send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
          });
          continue;
        }

        if (msg.type === 'approve' && typeof msg.jobId === 'string' && typeof msg.stepId === 'string') {
          resolveApproval(msg.jobId, msg.stepId, msg.approved !== false);
          send({ type: 'ok' });
          continue;
        }

        if (msg.type === 'ping') {
          send({ type: 'pong' });
          continue;
        }

        send({ type: 'error', message: 'unknown command' });
      }
    });
  }).listen(port, '127.0.0.1', () => {
    console.log(`[gateway] listening on 127.0.0.1:${port}`);
  });

  async function runJob(job: JobRecord, sock: Socket, c: GatewayContext): Promise<void> {
    const emit = (
      jobId: string,
      phase: JobPhase,
      intern: string | null,
      message: string,
      meta?: { stepId?: string },
    ) => {
      const patch: Partial<JobRecord> = {
        phase,
        lastMessage: message,
        status:
          phase === 'await_approval'
            ? 'needs_approval'
            : phase === 'done'
              ? 'done'
              : 'running',
      };
      if (intern === 'mei' || intern === 'sora' || intern === 'hana') {
        patch.intern = intern;
      }
      updateJob(jobId, patch);
      sock.write(
        `${JSON.stringify({
          type: 'event',
          jobId,
          phase,
          intern,
          message,
          stepId: meta?.stepId,
        })}\n`,
      );
    };

    updateJob(job.id, { status: 'running', phase: 'gather_context' });

    const approve = async (jobId: string, stepId: string): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        approvalResolvers.set(approvalKey(jobId, stepId), resolve);
      });
    };

    try {
      await runAgentLoop(
        c.openai,
        job.id,
        job.goal,
        getWorkspaceRoot(),
        (jobId, phase, intern, message, meta) => emit(jobId, phase, intern, message, meta),
        async (jobId, stepId, _tool) => approve(jobId, stepId),
      );
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      updateJob(job.id, { status: 'error', error: err, phase: 'done' });
      emit(job.id, 'done', null, `Error: ${err}`);
    }
  }
}
