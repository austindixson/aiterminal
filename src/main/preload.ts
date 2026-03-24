/**
 * Preload script — exposes typed IPC methods to the renderer
 * via Electron's contextBridge.
 *
 * Every method maps to an IPC channel registered in ipc-handlers.ts.
 * The renderer accesses these via `window.electronAPI`.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../types/index.js';

const electronAPI: ElectronAPI = {
  // --- Command execution ---
  executeCommand: (command: string) =>
    ipcRenderer.invoke('execute-command', command),

  // --- AI queries ---
  aiQuery: (request: { prompt: string; taskType: string; context?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> }) =>
    ipcRenderer.invoke('ai-query', request),

  // --- Theme management ---
  getThemes: () =>
    ipcRenderer.invoke('get-themes'),

  setTheme: (themeName: string) =>
    ipcRenderer.invoke('set-theme', themeName),

  getThemeConfig: () =>
    ipcRenderer.invoke('get-theme-config'),

  // --- PTY bridge ---
  onPtyData: (callback: (data: string) => void) => {
    ipcRenderer.on('pty-data', (_event, data: string) => {
      callback(data);
    });
  },

  writeToPty: (data: string) => {
    ipcRenderer.send('write-to-pty', data);
  },

  resizePty: (cols: number, rows: number) => {
    ipcRenderer.send('resize-pty', cols, rows);
  },

  // --- File tree ---
  readDirectory: (dirPath: string) =>
    ipcRenderer.invoke('read-directory', dirPath),

  readDirectoryTree: (dirPath: string, depth: number) =>
    ipcRenderer.invoke('read-directory-tree', dirPath, depth),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
