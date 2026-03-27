/**
 * Editor column types for multi-column editor support
 *
 * Similar to VSCode's editor group system, supporting split panes with file tabs.
 * Each column manages its own set of file tabs and can be resized independently.
 */

/**
 * Represents a single file tab within an editor column
 */
export interface FileTab {
  /** Unique identifier for this tab instance */
  readonly id: string;
  /** Absolute path to the file */
  readonly filePath: string;
  /** Short display name (basename of filePath) */
  readonly title: string;
  /** Whether this tab is currently focused in its column */
  readonly isActive: boolean;
  /** Whether the file has unsaved changes */
  readonly isModified: boolean;
  /** Language ID for syntax highlighting (optional) */
  readonly language?: string;
}

/**
 * Represents a vertical editor column (similar to VSCode editor group)
 */
export interface EditorColumn {
  /** Unique identifier for this column */
  readonly id: string;
  /** All file tabs in this column */
  readonly tabs: ReadonlyArray<FileTab>;
  /** ID of the currently active tab (null if column is empty) */
  readonly activeTabId: string | null;
  /** Width ratio for flexible column layout (0-1, null for equal split) */
  readonly splitRatio: number | null;
}

/**
 * Complete state for the multi-column editor system
 */
export interface ColumnsState {
  /** All editor columns */
  readonly columns: ReadonlyArray<EditorColumn>;
  /** ID of the currently focused column (null if no columns) */
  readonly activeColumnId: string | null;
}

/**
 * Persisted layout structure for localStorage
 *
 * Includes version field for future schema migrations and timestamp
 * for debugging/layout history tracking.
 */
export interface PersistedLayout {
  /** Schema version for migration support */
  readonly version: 1;
  /** ISO timestamp when layout was last saved */
  readonly timestamp: number;
  /** All editor columns with their tabs */
  readonly columns: ReadonlyArray<{
    readonly id: string;
    readonly tabs: ReadonlyArray<{
      readonly id: string;
      readonly filePath: string;
      readonly title: string;
      readonly isActive: boolean;
      readonly isModified: boolean;
      readonly language?: string;
    }>;
    readonly activeTabId: string | null;
    readonly splitRatio: number | null;
  }>;
  /** ID of the currently focused column */
  readonly activeColumnId: string | null;
}
