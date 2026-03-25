/**
 * Terminal tab types for multi-terminal support
 */

export interface TerminalTab {
  readonly id: string;
  /** PTY session id — stable for this tab until closed. */
  readonly sessionId: string;
  readonly name: string;
  readonly shell: string;
  readonly cwd: string;
  readonly createdAt: number;
  readonly isActive: boolean;
  /** Agent intern working in this tab (mei/sora/hana) */
  readonly agentIntern?: string;
  /** What the agent is currently doing */
  readonly agentActivity?: string;
}

export interface TerminalTabsState {
  readonly tabs: ReadonlyArray<TerminalTab>;
  readonly activeTabId: string | null;
  readonly activeSessionId: string | null;
  readonly sessions: ReadonlyMap<string, TerminalSessionInfo>;
}

export interface TerminalSessionInfo {
  readonly sessionId: string;
  readonly ptyPid: number;
  readonly shell: string;
  readonly cwd: string;
  readonly unsubscribe: () => void;
}
