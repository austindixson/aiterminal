export interface FilePreviewState {
  readonly isOpen: boolean
  readonly filePath: string | null
  readonly fileName: string | null
  readonly content: string | null
  readonly language: string | null
  readonly isLoading: boolean
  readonly error: string | null
  readonly lineCount: number
  readonly fileSize: number        // bytes
  readonly scrollPosition: number
}

export interface SyntaxToken {
  readonly type: 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'type' | 'operator' | 'plain'
  readonly value: string
}
