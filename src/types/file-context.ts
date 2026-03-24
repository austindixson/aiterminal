/**
 * Types for the Multi-file @Context system.
 *
 * Enables @mention-based file attachment in chat and Cmd+K.
 * Users type @filename to load file content into AI context.
 *
 * All types are immutable (readonly) to prevent accidental mutation.
 */

export interface FileContext {
  readonly path: string
  readonly name: string
  readonly content: string
  readonly language: string
  readonly truncated: boolean      // true if content was cut
  readonly charCount: number
}

export interface MentionMatch {
  readonly raw: string             // "@src/main.ts"
  readonly path: string            // "src/main.ts"
  readonly startIndex: number
  readonly endIndex: number
}

export interface FilePickerState {
  readonly isOpen: boolean
  readonly query: string
  readonly results: ReadonlyArray<FilePickerResult>
  readonly selectedIndex: number
}

export interface FilePickerResult {
  readonly path: string
  readonly name: string
  readonly relativePath: string
  readonly isDirectory: boolean
}
