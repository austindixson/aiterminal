/**
 * Preload script — exposes typed IPC methods to the renderer
 * via Electron's contextBridge.
 *
 * Every method maps to an IPC channel registered in ipc-handlers.ts.
 * The renderer accesses these via `window.electronAPI`.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../types/index.js';

// ---------------------------------------------------------------------------
// PTY data buffering
// ---------------------------------------------------------------------------
// The shell prompt arrives from PTY before xterm.js mounts and registers its
// onPtyData listener. We buffer all incoming PTY data in the preload layer and
// flush it once the renderer explicitly subscribes via onPtyData.
// ---------------------------------------------------------------------------

let ptyBuffer: string[] = [];
let ptyCallback: ((data: string) => void) | null = null;

ipcRenderer.on('pty-data', (_event, data: string) => {
  if (ptyCallback) {
    ptyCallback(data);
  } else {
    ptyBuffer.push(data);
  }
});

const electronAPI: ElectronAPI = {
  // --- Command execution ---
  executeCommand: (command: string) =>
    ipcRenderer.invoke('execute-command', command),

  // --- AI queries ---
  aiQuery: (request) =>
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
    ptyCallback = callback;
    // Flush any data that arrived before the renderer was ready
    for (const data of ptyBuffer) {
      callback(data);
    }
    ptyBuffer = [];
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

  // --- File preview ---
  readFile: (filePath: string) =>
    ipcRenderer.invoke('read-file', filePath),

  // --- Agent file operations ---
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('write-file', filePath, content),

  deleteFile: (filePath: string) =>
    ipcRenderer.invoke('delete-file', filePath),

  // --- Autocomplete ---
  getAutocompleteContext: () =>
    ipcRenderer.invoke('get-autocomplete-context'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
