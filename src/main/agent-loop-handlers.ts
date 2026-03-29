/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/agent-loop-handlers.ts
 * Module: main
 * Purpose: IPC handlers for agent loop - start, stream, abort
 * Dependencies: electron, ../agent-loop
 * Related: /Users/ghost/Desktop/aiterminal/src/main/ipc-handlers.ts
 * Keywords: agent-loop, ipc-handlers, agent-api
 * Last Updated: 2026-03-24
 */

import { ipcMain, BrowserWindow } from 'electron';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { AgentLoopConfig, AgentEvent } from '../agent-loop/events.js';
import { getAgentLoopRouter } from '../agent-loop/router.js';
import type { IAIClient } from '../ai/client.js';

/**
 * Shared AI client reference for agent interns.
 * Set via setAgentAIClient() from main.ts after initialization.
 */
let agentAIClient: IAIClient | null = null;

export function setAgentAIClient(client: IAIClient): void {
  agentAIClient = client;
}

/**
 * Create an aiQuery function that uses the shared AI client.
 */
function createAiQueryFn(): ((prompt: string) => Promise<string>) | undefined {
  if (!agentAIClient) return undefined;
  const client = agentAIClient;
  return async (prompt: string): Promise<string> => {
    const response = await client.query({
      prompt,
      taskType: 'general',
      context: [],
    });
    return response.content ?? '';
  };
}

/**
 * Validate workspace root from renderer — reject traversal and sensitive paths.
 */
function sanitizeWorkspaceRoot(raw?: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  const fallback = resolve(homeDir, '.interns');
  if (!raw) return fallback;

  const resolved = resolve(raw);
  // Reject paths containing traversal or pointing to system roots
  if (resolved.includes('..') || resolved === '/' || resolved === 'C:\\') {
    return fallback;
  }
  // Must exist as a directory (or be creatable under home)
  if (!existsSync(resolved) && !resolved.startsWith(resolve(homeDir))) {
    return fallback;
  }
  return resolved;
}

/**
 * Get the main browser window (for IPC forwarding).
 */
function getMainWindow(): BrowserWindow | undefined {
  const windows = BrowserWindow.getAllWindows();
  return windows.find(w => !w.isDestroyed());
}

/**
 * Start agent loop IPC handler.
 * Returns immediately with runId, executes in background.
 */
ipcMain.handle('agent:start', async (_event, request) => {
  const { task, config = {} } = request;

  const sessionId = global.crypto.randomUUID();
  const runId = global.crypto.randomUUID();

  // Validate input
  if (!task || typeof task !== 'string' || !task.trim()) {
    return {
      success: false,
      error: 'Task is required and must be a non-empty string'
    };
  }

  // Default config
  const defaultTimeout = {
    mei: 600,
    sora: 120,
    hana: 180
  };

  const agentConfig: AgentLoopConfig = {
    sessionId,
    runId,
    workspaceRoot: sanitizeWorkspaceRoot(config.workspaceRoot),
    transcriptDb: config.transcriptDb,
    timeouts: {
      mei: config.timeouts?.mei || defaultTimeout.mei,
      sora: config.timeouts?.sora || defaultTimeout.sora,
      hana: config.timeouts?.hana || defaultTimeout.hana
    },
    qualityGates: {
      requireTests: config.qualityGates?.requireTests ?? true,
      requireSources: config.qualityGates?.requireSources ?? true,
      requireReview: config.qualityGates?.requireReview ?? false
    },
    aiQuery: createAiQueryFn(),
  };

  // Run in background
  const router = getAgentLoopRouter();

  // Listen for events and forward to renderer — guard by runId to prevent doubling
  const eventListener = (evt: AgentEvent) => {
    const evtRunId = 'runId' in evt.data ? (evt.data as { runId?: string }).runId : undefined;
    if (evtRunId && evtRunId !== runId) return;
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent:event', evt);
    }
  };

  router.on('event', eventListener);

  // Execute
  router.run(task, agentConfig).then(result => {
    router.off('event', eventListener);

    // Send completion event
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent:complete', { runId, result });
    }
  }).catch(err => {
    router.off('event', eventListener);

    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent:error', {
        runId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });

  // Return immediately (async start)
  return {
    success: true,
    runId,
    sessionId,
    acceptedAt: Date.now()
  };
});

/**
 * Subscribe to agent events stream.
 */
ipcMain.handle('agent:stream', async () => {
  // Events are already forwarded via 'agent:event' in agent:start
  return {
    success: true,
    message: 'Subscribed to agent events'
  };
});

/**
 * Abort running agent.
 */
ipcMain.handle('agent:abort', async (_event, request) => {
  const { runId } = request;

  if (!runId) {
    return {
      success: false,
      error: 'runId is required'
    };
  }

  const router = getAgentLoopRouter();
  const aborted = router.abort(runId);

  if (aborted) {
    return {
      success: true,
      message: 'Agent aborted'
    };
  }

  return {
    success: false,
    error: 'Agent not found or already completed'
  };
});

/**
 * Get status of active agent runs.
 */
ipcMain.handle('agent:status', async () => {
  const router = getAgentLoopRouter();
  return {
    success: true,
    activeRuns: router.getActiveRunIds(),
  };
});
