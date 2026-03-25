/**
 * AITerminal gateway daemon — TCP control plane + OpenRouter agent loop.
 *
 * Env: OPENROUTER_API_KEY (required), AITERMINAL_GATEWAY_PORT, AITERMINAL_WORKSPACE_ROOT,
 * AITERMINAL_GATEWAY_AUTO_APPROVE=1 (auto-approve writes; dev only)
 */

import { config } from 'dotenv';
import { join } from 'node:path';
import OpenAI from 'openai';

import {
  DEFAULT_PORT,
  QUEUE_FILE,
  loadOrCreateToken,
  ensureGatewayDir,
} from './config.js';
import { loadJobsFromDisk } from './job-queue.js';
import { startGatewayServer } from './tcp-server.js';

// Load .env from the project root (daemon dist/ is at dist/, so we go up two levels to project root)
config({ path: join(__dirname, '../..', '.env') });

function main(): void {
  const apiKey = process.env.OPENROUTER_API_KEY;
  console.log('[gateway] OPENROUTER_API_KEY:', apiKey ? 'Set (length: ' + apiKey.length + ')' : 'Not set');
  if (!apiKey) {
    console.error('[gateway] OPENROUTER_API_KEY is required');
    process.exit(1);
  }

  ensureGatewayDir();
  const token = loadOrCreateToken();
  loadJobsFromDisk(QUEUE_FILE);

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  });

  const port = DEFAULT_PORT;
  console.log(`[gateway] token file: ~/.aiterminal/gateway.token (use for Electron client)`);
  startGatewayServer(port, {
    token,
    openai: client,
    queuePath: QUEUE_FILE,
  });
}

main();
