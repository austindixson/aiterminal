/**
 * Types for the Agent Mode feature.
 *
 * Agent mode lets AI autonomously propose file changes (create, edit, delete)
 * that the user can approve or reject before they are applied.
 *
 * All types are immutable (readonly) to prevent accidental mutation.
 */

export interface FileOperation {
  readonly id: string
  readonly type: 'create' | 'edit' | 'delete' | 'read'
  readonly filePath: string
  readonly content?: string          // new content (create/edit)
  readonly originalContent?: string  // for showing diffs (edit)
  readonly description: string
  readonly status: 'pending' | 'approved' | 'rejected' | 'applied'
}

export interface AgentPlan {
  readonly id: string
  readonly description: string
  readonly operations: ReadonlyArray<FileOperation>
  readonly status: 'planning' | 'awaiting_approval' | 'executing' | 'complete' | 'cancelled'
  readonly createdAt: number
}

export interface AgentState {
  readonly isActive: boolean
  readonly currentPlan: AgentPlan | null
  readonly history: ReadonlyArray<AgentPlan>
}
