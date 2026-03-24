/**
 * Types for the AI Autocomplete system.
 *
 * Provides intelligent tab completion powered by AI, combining
 * local path/command completions with AI-generated suggestions.
 */

// ---------------------------------------------------------------------------
// Suggestion
// ---------------------------------------------------------------------------

export interface AutocompleteSuggestion {
  readonly text: string           // the completion text
  readonly description: string    // short explanation
  readonly type: 'command' | 'path' | 'flag' | 'ai'  // source type
  readonly confidence: number     // 0-1
}

// ---------------------------------------------------------------------------
// State (managed by useAutocomplete hook)
// ---------------------------------------------------------------------------

export interface AutocompleteState {
  readonly isVisible: boolean
  readonly suggestions: ReadonlyArray<AutocompleteSuggestion>
  readonly selectedIndex: number
  readonly partialInput: string
  readonly isLoading: boolean
}

// ---------------------------------------------------------------------------
// Context (sent to AI for smart completions)
// ---------------------------------------------------------------------------

export interface AutocompleteContext {
  readonly partialInput: string
  readonly cwd: string
  readonly recentCommands: ReadonlyArray<string>
  readonly shellType: string
}
