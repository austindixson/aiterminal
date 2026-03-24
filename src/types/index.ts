import type { FileEntry } from './file-tree'

/** Terminal color theme definition */
export interface Theme {
  readonly name: string;
  readonly colors: ThemeColors;
  readonly opacity: number;
  readonly blur: number;
}

export interface ThemeColors {
  readonly bg: string;
  readonly fg: string;
  readonly cursor: string;
  readonly selection: string;
  readonly ansi: readonly [
    string, string, string, string,
    string, string, string, string,
    string, string, string, string,
    string, string, string, string,
  ];
}

/** Response from the AI model */
export interface AIResponse {
  readonly content: string;
  readonly model: string;
  readonly tokens: number;
  readonly latency: number;
}

/** Result of a terminal command execution */
export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly isAITriggered: boolean;
}

/** Configuration for an AI model */
export interface ModelConfig {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly costPer1k: number;
  readonly maxTokens: number;
}

/** Router preset mapping task types to models */
export interface RouterPreset {
  readonly name: string;
  readonly models: Readonly<Record<string, ModelConfig>>;
}

/** IPC channel names for type-safe communication */
export type IpcChannel =
  | "execute-command"
  | "ai-query"
  | "get-themes"
  | "set-theme"
  | "get-theme-config"
  | "pty-data"
  | "write-to-pty"
  | "resize-pty"
  | "read-directory"
  | "read-directory-tree";

/** AI query request shape from the renderer */
export interface AIQueryRequest {
  readonly prompt: string;
  readonly taskType: string;
  readonly context?: ReadonlyArray<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

/** Electron API exposed via contextBridge */
export interface ElectronAPI {
  executeCommand: (command: string) => Promise<CommandResult>;
  aiQuery: (request: AIQueryRequest) => Promise<AIResponse>;
  getThemes: () => Promise<readonly Theme[]>;
  setTheme: (themeName: string) => Promise<Theme | null>;
  getThemeConfig: () => Promise<string>;
  onPtyData: (callback: (data: string) => void) => void;
  writeToPty: (data: string) => void;
  resizePty: (cols: number, rows: number) => void;
  readDirectory: (dirPath: string) => Promise<ReadonlyArray<FileEntry>>;
  readDirectoryTree: (dirPath: string, depth: number) => Promise<ReadonlyArray<FileEntry>>;
}

/** Augment the Window interface for preload */
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
