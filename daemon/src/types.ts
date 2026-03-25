export type InternId = 'mei' | 'sora' | 'hana';

export type JobPhase =
  | 'idle'
  | 'gather_context'
  | 'plan'
  | 'await_approval'
  | 'execute_tools'
  | 'verify'
  | 'done';

export interface DaemonEvent {
  readonly type: 'event';
  readonly jobId: string;
  readonly phase: JobPhase;
  readonly intern: InternId | null;
  readonly message: string;
}

export interface ToolCall {
  readonly id: string;
  readonly name: 'read_file' | 'write_file' | 'list_dir' | 'grep' | 'exec' | 'shell';
  readonly args: Record<string, string>;
  readonly needsApproval: boolean;
}
