import type { FileEntry } from './file-tree'
export type { FileTab, EditorColumn, ColumnsState, PersistedLayout } from './editor-columns'

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

/** Result of reading a file for the preview pane */
export interface FileReadResult {
  readonly content: string;
  readonly size: number;
  readonly error?: string;
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
  | "read-directory-tree"
  | "read-file"
  | "write-file"
  | "delete-file"
  | "get-autocomplete-context";

/** AI query request shape from the renderer */
export interface AIQueryRequest {
  readonly prompt: string;
  readonly taskType: string;
  readonly context?: ReadonlyArray<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  /** Override the model ID (bypasses preset routing). Used by RP mode. */
  readonly modelOverride?: string;
}

/** Active model for a task type + current router preset (from main process). */
export interface ActiveAiModelInfo {
  readonly id: string;
  readonly displayName: string;
  readonly presetName: string;
}

/** Electron API exposed via contextBridge */
/** Result of a file write/delete operation */
export interface FileWriteResult {
  readonly success: boolean;
  readonly error?: string;
}

export interface ElectronAPI {
  executeCommand: (command: string) => Promise<CommandResult>;
  aiQuery: (request: AIQueryRequest) => Promise<AIResponse>;
  /** Which model would handle this task (e.g. chat uses `general`). */
  getActiveAiModel: (taskType?: string) => Promise<ActiveAiModelInfo>;
  /** Switch the active preset (speed, balanced, performance, budget). */
  setAiPreset: (presetName: string) => Promise<{ success: boolean; presetName?: string; error?: string }>;
  /** Get all available presets and which is active. */
  getAiPresets: () => Promise<{
    success: boolean;
    presets?: Array<{
      name: string;
      description: string;
      models: Record<string, string>;
    }>;
    activePreset?: string;
    error?: string;
  }>;
  /** Streams assistant tokens from the main process OpenRouter client. */
  aiQueryStream: (
    request: AIQueryRequest,
    onChunk: (payload: {
      requestId: string;
      chunk: string;
      done: boolean;
      error?: string;
      cancelled?: boolean;
      model?: string;
      modelLabel?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      toolCall?: string;
    }) => void,
  ) => Promise<void>;
  cancelAIStream: (requestId: string) => void;

  /** Execute a command in an ephemeral PTY session (agent tool calls) */
  agentExec: (params: {
    command: string;
    cwd: string;
    timeoutMs?: number;
    executionId?: string;
  }) => Promise<{ output: string; exitCode: number; executionId: string }>;

  /** Kill all running agent processes */
  killAgentProcesses: () => Promise<{ killed: number }>;

  /** Gateway daemon (optional TCP client to ~/.aiterminal gateway) */
  onDaemonEvent: (callback: (payload: unknown) => void) => () => void;
  daemonSubmitGoal: (goal: string) => Promise<{ success: boolean }>;
  daemonApprove: (payload: {
    jobId: string;
    stepId: string;
    approved: boolean;
  }) => Promise<{ success: boolean }>;
  daemonReconnect: () => Promise<{ success: boolean }>;

  /** lossless-recall: persist chat turns (requires AITERMINAL_LOSSLESS_ROOT). */
  losslessSync: (payload: {
    sessionId: string;
    messages: ReadonlyArray<{ role: string; content: string }>;
  }) => Promise<{ ok: boolean; error?: string }>;

  /** dietmcp exec server tool --args JSON */
  dietmcpExec: (payload: {
    server: string;
    tool: string;
    argsJson: string;
  }) => Promise<{ ok: boolean; stdout: string; stderr: string }>;

  skinnytoolsWrap: (command: string) => Promise<{ ok: boolean; stdout: string; stderr: string }>;

  /** ferroclaw exec (requires AITERMINAL_FERROCLAW_BIN) */
  ferroclawExec: (goal: string) => Promise<{ ok: boolean; stdout: string; stderr: string }>;

  /** Kokoro-82M TTS (requires AITERMINAL_KOKORO=1 and Python deps). */
  kokoroTtsStatus: () => Promise<{
    configured: boolean;
    scriptPath: string;
    ready: boolean;
    lastError?: string;
  }>;
  kokoroTtsSpeak: (text: string) => Promise<{
    ok: boolean;
    mimeType?: string;
    dataBase64?: string;
    error?: string;
  }>;

  getThemes: () => Promise<readonly Theme[]>;
  setTheme: (themeName: string) => Promise<Theme | null>;
  getThemeConfig: () => Promise<string>;

  // --- Session management (NEW for multi-terminal support) ---
  createTerminalSession: (shell?: string, cwd?: string) => Promise<{
    success: boolean;
    sessionId?: string;
    ptyPid?: number;
    shell?: string;
    cwd?: string;
    error?: string;
  }>;
  destroyTerminalSession: (sessionId: string) => Promise<{ success: boolean }>;

  // --- Session-specific PTY operations ---
  onSessionData: (sessionId: string, callback: (data: string) => void) => () => void;
  writeToSession: (sessionId: string, data: string) => void;
  resizeSession: (sessionId: string, cols: number, rows: number) => void;
  getSessionCwd: (sessionId: string) => Promise<{ success: boolean; cwd?: string; error?: string }>;
  updateSessionCwd: (sessionId: string, cwd: string) => void;
  onSessionCwdChanged: (callback: (data: { sessionId: string; cwd: string }) => void) => () => void;

  // --- Legacy PTY bridge (deprecated, for backward compatibility) ---
  onPtyData: (callback: (data: string) => void) => () => void;
  onAnySessionData: (callback: (sessionId: string, data: string) => void) => () => void;
  writeToPty: (data: string) => void;
  resizePty: (cols: number, rows: number) => void;

  readDirectory: (dirPath: string) => Promise<ReadonlyArray<FileEntry>>;
  readDirectoryTree: (dirPath: string, depth: number) => Promise<ReadonlyArray<FileEntry>>;
  readFile: (filePath: string) => Promise<FileReadResult>;
  writeFile: (filePath: string, content: string) => Promise<FileWriteResult>;
  editFile: (filePath: string, search: string, replace: string) => Promise<FileWriteResult>;
  deleteFile: (filePath: string) => Promise<FileWriteResult>;
  getAutocompleteContext: (
    sessionId?: string,
  ) => Promise<{ cwd: string; recentCommands: ReadonlyArray<string> }>;

  // --- Agent loop (intern system) ---
  agentStart: (payload: {
    task: string;
    config?: {
      workspaceRoot?: string;
      timeouts?: Record<string, number>;
    };
  }) => Promise<{
    success: boolean;
    runId?: string;
    sessionId?: string;
    acceptedAt?: number;
    error?: string;
  }>;
  agentAbort: (payload: { runId: string }) => Promise<{ success: boolean; error?: string }>;
  agentStatus: () => Promise<{
    active: boolean;
    runId?: string;
    intern?: string;
  }>;
  onAgentEvent: (callback: (evt: { stream: string; data: any }) => void) => () => void;
  onAgentComplete: (callback: (data: { runId: string; result: any }) => void) => () => void;
  onAgentError: (callback: (data: { runId: string; error: string }) => void) => () => void;

  // --- Agent mode: update system prompt with intern identity ---
  updateInternSystemPrompt: (payload: string | null | { intern: string | null; cwd?: string }) => Promise<{
    success: boolean;
    error?: string;
  }>;

  // --- Memory system (Hermes-style) ---
  memoryTool: (args: {
    action: string;
    file: string;
    content?: string;
    oldText?: string;
    newText?: string;
  }) => Promise<{
    success: boolean;
    error?: string;
    entries?: readonly string[];
    usage?: { chars: number; limit: number; percent: number };
  }>;

  // --- Transcript search and retrieval ---
  transcriptSearch: (query: string, limit?: number) => Promise<{
    success: boolean;
    results?: Array<{
      messageId: string;
      sessionId: string;
      intern: string;
      task: string;
      role: string;
      content: string;
      timestamp: number;
      rank: number;
    }>;
    error?: string;
  }>;
  transcriptSemanticSearch: (query: string, limit?: number) => Promise<{
    success: boolean;
    results?: Array<{
      messageId: string;
      sessionId: string;
      intern: string;
      task: string;
      role: string;
      content: string;
      timestamp: number;
      rank: number;
    }>;
    error?: string;
  }>;
  transcriptGetSession: (sessionId: string) => Promise<{
    success: boolean;
    session?: {
      id: string;
      runId: string;
      intern: string;
      task: string;
      workspace?: string;
      startedAt: number;
      endedAt?: number;
      status: 'running' | 'completed' | 'failed' | 'timeout';
      metadata?: Record<string, unknown>;
    };
    messages?: Array<{
      id: string;
      sessionId: string;
      role: 'user' | 'assistant' | 'system' | 'tool';
      content: string;
      timestamp: number;
      metadata?: Record<string, unknown>;
    }>;
    events?: Array<{
      id: string;
      sessionId: string;
      stream: string;
      data: Record<string, unknown>;
      timestamp: number;
    }>;
    error?: string;
  }>;
  transcriptGetRecentSessions: (limit?: number, intern?: string) => Promise<{
    success: boolean;
    sessions?: Array<{
      id: string;
      runId: string;
      intern: string;
      task: string;
      workspace?: string;
      startedAt: number;
      endedAt?: number;
      status: 'running' | 'completed' | 'failed' | 'timeout';
      metadata?: Record<string, unknown>;
    }>;
    error?: string;
  }>;
  transcriptGetStats: () => Promise<{
    success: boolean;
    stats?: {
      sessions: number;
      messages: number;
      events: number;
      sizeBytes: number;
    };
    error?: string;
  }>;
  transcriptVacuum: () => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;

  // --- Claude Code CLI TUI capture ---
  startTuiCapture: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  stopTuiCapture: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  getTuiContent: (sessionId: string) => Promise<{ content: string; timestamp: number }>;
  onTuiContentUpdated: (callback: (data: { sessionId: string; content: string; timestamp: number }) => void) => () => void;

  // --- Claude Code CLI service ---
  claudeCodeSpawn: (args?: string[]) => Promise<boolean>;
  claudeCodeWrite: (input: string) => Promise<void>;
  claudeCodeKill: () => Promise<void>;
  claudeCodeIsRunning: () => Promise<boolean>;
  onClaudeCodeOutput: (callback: (data: string) => void) => () => void;
  onClaudeCodeError: (callback: (error: string) => void) => () => void;
  onClaudeCodeClose: (callback: (code: number) => void) => () => void;

  // --- Claude Code log reading ---
  getClaudeCodeLog: (limit?: number) => Promise<{
    success: boolean;
    messages?: ClaudeCodeMessage[];
    error?: string;
  }>;
  startClaudeCodeLogWatcher: () => Promise<{ success: boolean; error?: string }>;
  stopClaudeCodeLogWatcher: () => Promise<{ success: boolean }>;
  onClaudeCodeLogUpdated: (callback: (data: { messages: ClaudeCodeMessage[]; timestamp: number }) => void) => () => void;
}

/** Claude Code session message from JSONL log */
export interface ClaudeCodeMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: number;
  tools?: Array<{
    name: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: string;
  }>;
}

/** Environment variables exposed from main process */
export interface EnvVars {
  VITE_ELEVENLABS_API_KEY: string;
}

/** Augment the Window interface for preload */
declare global {
  interface Window {
    electronAPI: ElectronAPI;
    env: EnvVars;
  }
}
