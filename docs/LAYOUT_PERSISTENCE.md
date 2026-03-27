# Layout Persistence Implementation

## Overview

Complete layout persistence system for the multi-column editor that saves and restores column layout, tabs, and split ratios across app restarts.

## Features

### 1. Auto-Save Layout
- **Trigger**: Automatically saves on any state change
- **Debounce**: 500ms delay to avoid excessive localStorage writes
- **Storage Key**: `aiterminal-editor-layout`
- **Captured State**:
  - Column count and IDs
  - Tab list per column (file paths, titles, languages)
  - Active tab per column
  - Active column
  - Split ratios for flexible column widths
  - Modified state of tabs

### 2. Layout Schema Version 1

```typescript
interface PersistedLayout {
  readonly version: 1;           // Schema version for migrations
  readonly timestamp: number;    // Last save time (Unix timestamp)
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
  readonly activeColumnId: string | null;
}
```

### 3. Restore on Mount

**Initialization Flow**:
1. On app mount, `useEditorColumns` hook initializes
2. Attempts to load persisted layout from localStorage
3. Validates loaded layout structure
4. If valid: restores columns, tabs, and active states
5. If invalid/missing: creates single default empty column

**Validation Checks**:
- Version compatibility (must be version 1)
- Column count (1-4 columns)
- Column structure (id, tabs array)
- Tab structure (id, filePath, title)
- Active tab references must exist
- Active column reference must exist
- Split ratios must be between 0-1

### 4. Migration Support

**Legacy Format Detection**:
- Detects pre-versioning layouts (no `version` field)
- Automatically migrates to version 1 format
- Updates persisted storage after migration
- Logs migration events for debugging

**Migration Path**:
```
Legacy (no version) → Version 1 (with version, timestamp)
```

**Future Migrations**:
- Version field enables incremental schema changes
- On version mismatch: attempt migration or discard
- Each version can implement specific migration logic

### 5. Error Handling

**Graceful Degradation**:
- Corrupted data: Falls back to default single column
- Invalid structure: Logs warning, uses defaults
- Missing fields: Validates before restoring
- Storage errors: Caught and logged, no crashes

**Logging**:
- Save success/failure with timestamps
- Load success with column count and timestamp
- Migration events
- Validation failures with specific reasons

## Implementation Details

### Hook: `useEditorColumns`

**New/Modified Functions**:

1. **`saveLayout()`** - Enhanced with version and timestamp
   - Adds `version: 1` to layout
   - Adds `timestamp: Date.now()` for debugging
   - Logs success/failure

2. **`loadLayout()`** - Complete rewrite with validation
   - Checks for legacy format (no version field)
   - Validates all data structures
   - Verifies reference integrity
   - Returns boolean success status

3. **`migrateLegacyLayout()`** - New function
   - Converts legacy format to version 1
   - Saves migrated layout back to storage
   - Restores state from migrated data

4. **`clearLayout()`** - Unchanged
   - Removes layout from localStorage
   - Useful for reset/debugging

5. **Auto-save Effect** - Already implemented
   - Watches `columns` and `activeColumnId`
   - Debounces saves by 500ms
   - Skips save during initial mount

## Usage Examples

### Manual Save/Load

```typescript
const { saveLayout, loadLayout, clearLayout } = useEditorColumns()

// Save current layout
saveLayout()

// Load saved layout (returns true if successful)
const loaded = loadLayout()

// Clear saved layout (reset to defaults)
clearLayout()
```

### Automatic Behavior

```typescript
// All of these trigger auto-save with 500ms debounce:
addColumn()                    // Add new column
removeColumn(id)               // Remove column
addTab(colId, path)            // Add tab
closeTab(colId, tabId)         // Close tab
setActiveTab(colId, tabId)     // Switch tab
setActiveColumn(colId)         // Switch column
setSplitRatio(colId, ratio)    // Resize column
```

## Testing

### Manual Test Page

Open `test-layout-persistence.html` in browser to test:
- Save test layouts
- Load and inspect layouts
- Clear layouts
- Test legacy format migration

### Console Output

Look for these log messages:
- `[useEditorColumns] Layout saved successfully`
- `[useEditorColumns] Layout loaded successfully (N column(s), timestamp)`
- `[useEditorColumns] Migrating legacy layout to version 1`
- `[useEditorColumns] Legacy layout migrated successfully`
- `[useEditorColumns] Invalid layout: <reason>`

## Future Enhancements

### Version 2+ Ideas

1. **Window State**: Save window size/position
2. **Scroll Positions**: Restore scroll position per file
3. **Cursor Positions**: Restore cursor position per file
4. **Selection State**: Restore text selection
5. **Column Ordering**: Save column order for reorderable columns
6. **Tab Groups**: Support for named tab groups

### Migration Pattern

```typescript
// In loadLayout()
if (parsed.version === 1) {
  return migrateV1ToV2(parsed)
} else if (parsed.version === 2) {
  return migrateV2ToV3(parsed)
}
// ... etc
```

## Files Modified

1. **`src/types/editor-columns.ts`**
   - Added `version` and `timestamp` to `PersistedLayout`
   - Removed unused `LegacyPersistedLayout` (now local to hook)

2. **`src/renderer/hooks/useEditorColumns.ts`**
   - Enhanced `saveLayout()` with versioning
   - Rewrote `loadLayout()` with validation
   - Added `migrateLegacyLayout()` function
   - Added local `LegacyPersistedLayout` type

## Compatibility

- **Backward Compatible**: Migrates legacy formats automatically
- **Forward Compatible**: Version field enables future changes
- **Error Resilient**: Falls back to defaults on any error
- **Type Safe**: Full TypeScript validation

## Performance

- **Debounced Writes**: 500ms delay prevents excessive localStorage access
- **Lazy Load**: Only loads on mount, not on every render
- **Minimal Overhead**: Validation is fast and fails early
- **Storage Size**: Typical layout < 10KB

## Security

- **No Secrets**: Only stores UI state, no credentials
- **Same Origin**: localStorage is origin-scoped
- **Validation**: All data validated before use
- **Error Handling**: Graceful on corruption/attack
