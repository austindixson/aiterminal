/**
 * Keybinding types for the unified keyboard shortcut system.
 *
 * All keybindings are registered centrally through the useKeybindings hook.
 * Components consume these types to display and manage shortcuts.
 */

export interface Keybinding {
  readonly id: string
  readonly key: string              // e.g. 'k', 'b', 'p', '/'
  readonly meta: boolean            // Cmd on mac
  readonly shift: boolean
  readonly alt: boolean
  readonly ctrl: boolean
  readonly description: string
  readonly category: 'general' | 'ai' | 'navigation' | 'editor'
}

export interface KeybindingAction {
  readonly binding: Keybinding
  readonly handler: () => void
  readonly enabled: boolean
}
