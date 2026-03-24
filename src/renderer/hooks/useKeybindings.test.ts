import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeybindings } from './useKeybindings'
import {
  isMatch,
  formatKeybinding,
  createKeybinding,
} from './useKeybindings'
import type { Keybinding } from '@/types/keybindings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fireKeyDown(
  key: string,
  options: Partial<KeyboardEvent> = {},
): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  })
  window.dispatchEvent(event)
}

function makeBinding(overrides: Partial<Keybinding> = {}): Keybinding {
  return {
    id: 'test-binding',
    key: 'k',
    meta: true,
    shift: false,
    alt: false,
    ctrl: false,
    description: 'Test binding',
    category: 'general',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests: useKeybindings hook
// ---------------------------------------------------------------------------

describe('useKeybindings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // 1. Registers a keybinding and fires handler on match
  // -------------------------------------------------------------------------

  it('registers a keybinding and fires handler on match', () => {
    const handler = vi.fn()
    const binding = makeBinding({ id: 'cmd-k', key: 'k', meta: true })

    const { result } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(binding, handler)
    })

    fireKeyDown('k', { metaKey: true })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // 2. Does not fire when modifier doesn't match
  // -------------------------------------------------------------------------

  it('does not fire when modifier does not match', () => {
    const handler = vi.fn()
    const binding = makeBinding({ id: 'cmd-k', key: 'k', meta: true })

    const { result } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(binding, handler)
    })

    // Press 'k' without meta key
    fireKeyDown('k', { metaKey: false })

    expect(handler).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 3. Does not fire disabled keybindings
  // -------------------------------------------------------------------------

  it('does not fire disabled keybindings', () => {
    const handler = vi.fn()
    const binding = makeBinding({ id: 'cmd-k', key: 'k', meta: true })

    const { result } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(binding, handler, false)
    })

    fireKeyDown('k', { metaKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 4. Multiple keybindings can coexist
  // -------------------------------------------------------------------------

  it('multiple keybindings can coexist', () => {
    const handlerK = vi.fn()
    const handlerB = vi.fn()
    const bindingK = makeBinding({ id: 'cmd-k', key: 'k', meta: true })
    const bindingB = makeBinding({ id: 'cmd-b', key: 'b', meta: true, description: 'Toggle chat' })

    const { result } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(bindingK, handlerK)
      result.current.register(bindingB, handlerB)
    })

    fireKeyDown('k', { metaKey: true })
    fireKeyDown('b', { metaKey: true })

    expect(handlerK).toHaveBeenCalledTimes(1)
    expect(handlerB).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // 5. Unregisters on cleanup
  // -------------------------------------------------------------------------

  it('unregisters on cleanup', () => {
    const handler = vi.fn()
    const binding = makeBinding({ id: 'cmd-k', key: 'k', meta: true })

    const { result } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(binding, handler)
    })

    act(() => {
      result.current.unregister('cmd-k')
    })

    fireKeyDown('k', { metaKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 6. getKeybindings() returns all registered
  // -------------------------------------------------------------------------

  it('getKeybindings() returns all registered bindings', () => {
    const bindingK = makeBinding({ id: 'cmd-k', key: 'k', meta: true })
    const bindingB = makeBinding({ id: 'cmd-b', key: 'b', meta: true, category: 'ai' })

    const { result } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(bindingK, vi.fn())
      result.current.register(bindingB, vi.fn())
    })

    const all = result.current.getKeybindings()
    expect(all).toHaveLength(2)
    expect(all.map(a => a.binding.id)).toContain('cmd-k')
    expect(all.map(a => a.binding.id)).toContain('cmd-b')
  })

  // -------------------------------------------------------------------------
  // 7. getKeybindingsByCategory() filters
  // -------------------------------------------------------------------------

  it('getKeybindingsByCategory() filters by category', () => {
    const general = makeBinding({ id: 'cmd-k', key: 'k', meta: true, category: 'general' })
    const ai = makeBinding({ id: 'cmd-b', key: 'b', meta: true, category: 'ai' })
    const nav = makeBinding({ id: 'cmd-p', key: 'p', meta: true, category: 'navigation' })

    const { result } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(general, vi.fn())
      result.current.register(ai, vi.fn())
      result.current.register(nav, vi.fn())
    })

    const aiBindings = result.current.getKeybindingsByCategory('ai')
    expect(aiBindings).toHaveLength(1)
    expect(aiBindings[0].binding.id).toBe('cmd-b')
  })

  // -------------------------------------------------------------------------
  // 8. Does not fire when input/textarea is focused (unless meta key)
  // -------------------------------------------------------------------------

  it('does not fire when input element is focused without meta key', () => {
    const handler = vi.fn()
    const binding = makeBinding({
      id: 'escape',
      key: 'Escape',
      meta: false,
      shift: false,
      alt: false,
      ctrl: false,
    })

    const { result } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(binding, handler)
    })

    // Create an input and focus it
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    // Fire Escape from the input (no meta key)
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'target', { value: input })
    window.dispatchEvent(event)

    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(input)
  })

  it('fires when input is focused if meta key is pressed', () => {
    const handler = vi.fn()
    const binding = makeBinding({ id: 'cmd-k', key: 'k', meta: true })

    const { result } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(binding, handler)
    })

    // Create an input and focus it
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    // Fire Cmd+K from the input
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'target', { value: input })
    window.dispatchEvent(event)

    expect(handler).toHaveBeenCalledTimes(1)

    document.body.removeChild(input)
  })

  // -------------------------------------------------------------------------
  // 9. Supports Cmd+Shift+key combinations
  // -------------------------------------------------------------------------

  it('supports Cmd+Shift+key combinations', () => {
    const handler = vi.fn()
    const binding = makeBinding({
      id: 'cmd-shift-p',
      key: 'p',
      meta: true,
      shift: true,
    })

    const { result } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(binding, handler)
    })

    // Cmd+P without Shift should NOT fire
    fireKeyDown('p', { metaKey: true, shiftKey: false })
    expect(handler).not.toHaveBeenCalled()

    // Cmd+Shift+P should fire
    fireKeyDown('p', { metaKey: true, shiftKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // 10. Handles key conflicts (last registered wins)
  // -------------------------------------------------------------------------

  it('handles key conflicts: last registered wins', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const binding = makeBinding({ id: 'cmd-k', key: 'k', meta: true })

    const { result } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(binding, handler1)
    })

    // Re-register with same ID, different handler
    act(() => {
      result.current.register(binding, handler2)
    })

    fireKeyDown('k', { metaKey: true })

    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // 11. Cleanup removes window listener on unmount
  // -------------------------------------------------------------------------

  it('removes event listener on unmount', () => {
    const handler = vi.fn()
    const binding = makeBinding({ id: 'cmd-k', key: 'k', meta: true })

    const { result, unmount } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(binding, handler)
    })

    unmount()

    fireKeyDown('k', { metaKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 12. Case-insensitive key matching
  // -------------------------------------------------------------------------

  it('matches keys case-insensitively', () => {
    const handler = vi.fn()
    const binding = makeBinding({ id: 'cmd-k', key: 'k', meta: true })

    const { result } = renderHook(() => useKeybindings())

    act(() => {
      result.current.register(binding, handler)
    })

    // Uppercase K (e.g. Shift held but not in binding)
    // This should NOT match because shift doesn't match
    fireKeyDown('K', { metaKey: true, shiftKey: true })
    expect(handler).not.toHaveBeenCalled()

    // Lowercase k with meta
    fireKeyDown('k', { metaKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: isMatch (pure function)
// ---------------------------------------------------------------------------

describe('isMatch', () => {
  it('correctly matches when all modifiers and key match', () => {
    const binding = makeBinding({ key: 'k', meta: true, shift: false, alt: false, ctrl: false })
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
    })

    expect(isMatch(event, binding)).toBe(true)
  })

  it('returns false when key does not match', () => {
    const binding = makeBinding({ key: 'k', meta: true })
    const event = new KeyboardEvent('keydown', {
      key: 'j',
      metaKey: true,
    })

    expect(isMatch(event, binding)).toBe(false)
  })

  it('returns false when modifier does not match', () => {
    const binding = makeBinding({ key: 'k', meta: true, shift: true })
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      shiftKey: false,
    })

    expect(isMatch(event, binding)).toBe(false)
  })

  it('matches Escape with no modifiers', () => {
    const binding = makeBinding({
      id: 'escape',
      key: 'Escape',
      meta: false,
      shift: false,
      alt: false,
      ctrl: false,
    })
    const event = new KeyboardEvent('keydown', { key: 'Escape' })

    expect(isMatch(event, binding)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: formatKeybinding (pure function)
// ---------------------------------------------------------------------------

describe('formatKeybinding', () => {
  it('formats Cmd+K as "\u2318K"', () => {
    const binding = makeBinding({ key: 'k', meta: true })
    expect(formatKeybinding(binding)).toBe('\u2318K')
  })

  it('formats Cmd+Shift+B as "\u2318\u21e7B"', () => {
    const binding = makeBinding({ key: 'b', meta: true, shift: true })
    expect(formatKeybinding(binding)).toBe('\u2318\u21e7B')
  })

  it('formats Cmd+Alt+I as "\u2318\u2325I"', () => {
    const binding = makeBinding({ key: 'i', meta: true, alt: true })
    expect(formatKeybinding(binding)).toBe('\u2318\u2325I')
  })

  it('formats Escape as "Esc"', () => {
    const binding = makeBinding({
      key: 'Escape',
      meta: false,
      shift: false,
      alt: false,
      ctrl: false,
    })
    expect(formatKeybinding(binding)).toBe('Esc')
  })

  it('formats Cmd+/ as "\u2318/"', () => {
    const binding = makeBinding({ key: '/', meta: true })
    expect(formatKeybinding(binding)).toBe('\u2318/')
  })

  it('formats Cmd+. as "\u2318."', () => {
    const binding = makeBinding({ key: '.', meta: true })
    expect(formatKeybinding(binding)).toBe('\u2318.')
  })

  it('formats Ctrl+Shift+F as "\u2303\u21e7F"', () => {
    const binding = makeBinding({ key: 'f', meta: false, ctrl: true, shift: true })
    expect(formatKeybinding(binding)).toBe('\u2303\u21e7F')
  })
})

// ---------------------------------------------------------------------------
// Tests: createKeybinding (pure function)
// ---------------------------------------------------------------------------

describe('createKeybinding', () => {
  it('creates a keybinding with correct defaults', () => {
    const binding = createKeybinding(
      'cmd-k',
      'k',
      'Toggle CmdK bar',
      'ai',
      { meta: true },
    )

    expect(binding.id).toBe('cmd-k')
    expect(binding.key).toBe('k')
    expect(binding.meta).toBe(true)
    expect(binding.shift).toBe(false)
    expect(binding.alt).toBe(false)
    expect(binding.ctrl).toBe(false)
    expect(binding.description).toBe('Toggle CmdK bar')
    expect(binding.category).toBe('ai')
  })
})
