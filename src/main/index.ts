/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/index.ts
 * Module: main
 * Purpose: Main process barrel export — re-exports IPC handler factories and types for clean imports
 * Dependencies: ipc-handlers
 * Related: /Users/ghost/Desktop/aiterminal/src/main/ipc-handlers.ts
 * Keywords: barrel-export, re-export, IPC-handlers, types, module-organization
 * Last Updated: 2026-03-24
 */

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
  SessionManagerRef,
  AIQueryStreamRequest,
} from './ipc-handlers.js';
