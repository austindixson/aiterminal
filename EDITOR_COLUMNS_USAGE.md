# Editor Columns Hook Usage Guide

## Overview

The `useEditorColumns` hook provides a VSCode-like multi-column editor system with file tabs. It manages column layout, tab operations, and keyboard shortcuts for a seamless multi-pane editing experience.

## Basic Usage

```tsx
import { useEditorColumns } from '@/renderer/hooks/useEditorColumns'

function EditorComponent() {
  const editorColumns = useEditorColumns()

  return (
    <div className="editor-container">
      {editorColumns.state.columns.map((column) => (
        <EditorColumn
          key={column.id}
          column={column}
          isActive={column.id === editorColumns.state.activeColumnId}
          onTabClose={(tabId) => editorColumns.closeTab(column.id, tabId)}
          onTabClick={(tabId) => {
            editorColumns.setActiveTab(column.id, tabId)
            editorColumns.setActiveColumn(column.id)
          }}
        />
      ))}
    </div>
  )
}
```

## Integration with App.tsx

```tsx
import { useEditorColumns } from '@/renderer/hooks/useEditorColumns'

export const App: FC = () => {
  const editorColumns = useEditorColumns()

  // Example: Open file from file tree in active column
  const handleFileTreeSelect = useCallback((filePath: string) => {
    const activeColumnId = editorColumns.state.activeColumnId
    if (activeColumnId) {
      editorColumns.addTab(activeColumnId, filePath)
    }
  }, [editorColumns])

  return (
    // ... your app layout
  )
}
```

## API Reference

### State Structure

```typescript
interface ColumnsState {
  columns: ReadonlyArray<EditorColumn>
  activeColumnId: string | null
}

interface EditorColumn {
  id: string
  tabs: ReadonlyArray<FileTab>
  activeTabId: string | null
  splitRatio: number | null
}

interface FileTab {
  id: string
  filePath: string
  title: string
  isActive: boolean
  isModified: boolean
  language?: string
}
```

### Methods

#### `addColumn()`
Create a new column (split view).
- **Shortcut:** `Cmd+\`

#### `removeColumn(columnId)`
Remove a column and its tabs.
- **Shortcut:** `Cmd+Shift+W`
- **Constraint:** Cannot remove the last column

#### `addTab(columnId, filePath)`
Open a file in a column. If the file is already open in that column, it activates the existing tab.

#### `closeTab(columnId, tabId)`
Close a tab. Automatically activates another tab if the active tab is closed.

#### `setActiveTab(columnId, tabId)`
Switch to a specific tab within a column.

#### `moveTab(tabId, fromColumnId, toColumnId)`
Move a tab from one column to another.

#### `setActiveColumn(columnId)`
Focus a specific column.
- **Shortcuts:** `Cmd+1/2/3/4`

#### `setSplitRatio(columnId, ratio)`
Set custom width ratio for a column (0-1). `null` uses equal split.

#### `setTabModified(columnId, tabId, modified)`
Mark a tab as modified (unsaved changes).

#### `saveLayout()` / `loadLayout()` / `clearLayout()`
Manual layout persistence. Auto-saves on changes.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+\` | Add new column |
| `Cmd+Shift+W` | Close active column |
| `Cmd+1/2/3/4` | Focus column by index |
| `Cmd+W` | Close active tab *(handled by parent component)* |

## Configuration

Constants in `useEditorColumns.ts`:
- `MAX_COLUMNS = 4` - Maximum number of columns
- `MIN_COLUMNS = 1` - Minimum number of columns
- `STORAGE_KEY = 'aiterminal-editor-layout'` - localStorage key

## File Tree Integration

```tsx
// In your file tree component
const handleFileDoubleClick = (filePath: string) => {
  const activeColumnId = editorColumns.state.activeColumnId
  if (activeColumnId) {
    editorColumns.addTab(activeColumnId, filePath)
  }
}
```

## Persistence

Layout automatically persists to localStorage on every state change (debounced 500ms). Includes:
- Column count and IDs
- Tab count, IDs, and file paths
- Active column and tab
- Split ratios

## Example Column Component

```tsx
interface EditorColumnProps {
  column: EditorColumn
  isActive: boolean
  onTabClose: (tabId: string) => void
  onTabClick: (tabId: string) => void
}

function EditorColumn({ column, isActive, onTabClose, onTabClick }: EditorColumnProps) {
  return (
    <div className={`editor-column ${isActive ? 'active' : ''}`}>
      {/* Tab bar */}
      <div className="tab-bar">
        {column.tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.isActive ? 'active' : ''}`}
            onClick={() => onTabClick(tab.id)}
          >
            <span className="tab-title">
              {tab.isModified && '• '}
              {tab.title}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onTabClose(tab.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Active tab content */}
      {column.activeTabId && (
        <FileEditor
          filePath={column.tabs.find(t => t.id === column.activeTabId)!.filePath}
          language={column.tabs.find(t => t.id === column.activeTabId)!.language}
          onModifiedChange={(modified) => {
            // Update modified state
          }}
        />
      )}
    </div>
  )
}
```

## Testing

Comprehensive tests available in `useEditorColumns.test.ts`:
- Column lifecycle (add/remove)
- Tab operations (add/close/move)
- Active state management
- Layout persistence
- Keyboard shortcuts
- Edge cases (max/min columns, invalid operations)

Run tests:
```bash
npx vitest run src/renderer/hooks/useEditorColumns.test.ts
```

## Architecture Notes

- **Immutability:** All state updates return new objects (no mutation)
- **Auto-save:** Layout persists automatically (debounced)
- **Language Detection:** Automatic syntax highlighting language detection from file extensions
- **Error Handling:** Graceful handling of invalid operations with console warnings
- **Type Safety:** Full TypeScript coverage with readonly interfaces
