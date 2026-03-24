/**
 * Diff view types for AITerminal.
 *
 * Defines the line-level diff data model, file diff aggregation,
 * and the overall diff view panel state.
 */

export type DiffLineType = 'added' | 'removed' | 'unchanged' | 'header'

export interface DiffLine {
  readonly type: DiffLineType
  readonly content: string
  readonly oldLineNum: number | null
  readonly newLineNum: number | null
}

export interface FileDiff {
  readonly filePath: string
  readonly oldContent: string
  readonly newContent: string
  readonly lines: ReadonlyArray<DiffLine>
  readonly additions: number
  readonly deletions: number
}

export interface DiffViewState {
  readonly isOpen: boolean
  readonly diffs: ReadonlyArray<FileDiff>
  readonly selectedFileIndex: number
  readonly status: 'reviewing' | 'accepted' | 'rejected'
}
