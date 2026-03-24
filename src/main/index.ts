/**
 * Main process barrel export.
 *
 * Re-exports the IPC handler factories and types so other modules
 * can import from '@/main' without reaching into internal files.
 */

export {
  createCommandHandler,
  createAIQueryHandler,
  createThemeHandlers,
  createPtyBridge,
  setupAllHandlers,
} from './ipc-handlers.js';

export type {
  IPtyProcess,
  PtyBridge,
  AIQueryRequest,
} from './ipc-handlers.js';
