/**
 * Tests for autocomplete-service — the core engine for AI-powered tab completion.
 *
 * TDD: these tests are written BEFORE the implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getLocalSuggestions,
  getCommandSuggestions,
  getAISuggestions,
  mergeSuggestions,
  buildAutocompletePrompt,
  clearAICache,
} from './autocomplete-service'
import type {
  AutocompleteSuggestion,
  AutocompleteContext,
} from '@/types/autocomplete'

// ---------------------------------------------------------------------------
// Mock: window.electronAPI (for directory reading)
// ---------------------------------------------------------------------------

const mockReadDirectory = vi.fn()
const mockAiQuery = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  clearAICache()

  Object.defineProperty(globalThis, 'window', {
    value: {
      ...globalThis.window,
      electronAPI: {
        readDirectory: mockReadDirectory,
        aiQuery: mockAiQuery,
      },
    },
    writable: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// getLocalSuggestions
// ---------------------------------------------------------------------------

describe('getLocalSuggestions', () => {
  it('returns path completions matching partial input after "cd "', async () => {
    mockReadDirectory.mockResolvedValue([
      { name: 'Desktop', isDirectory: true, path: '/Users/test/Desktop' },
      { name: 'Design', isDirectory: true, path: '/Users/test/Design' },
      { name: 'Downloads', isDirectory: true, path: '/Users/test/Downloads' },
      { name: '.zshrc', isDirectory: false, path: '/Users/test/.zshrc' },
    ])

    const suggestions = await getLocalSuggestions('cd Des', '/Users/test')

    expect(suggestions.length).toBeGreaterThanOrEqual(2)
    expect(suggestions.some((s) => s.text.includes('Desktop'))).toBe(true)
    expect(suggestions.some((s) => s.text.includes('Design'))).toBe(true)
    expect(suggestions.every((s) => s.type === 'path')).toBe(true)
  })

  it('returns file completions for "ls " in cwd', async () => {
    mockReadDirectory.mockResolvedValue([
      { name: 'file1.txt', isDirectory: false, path: '/Users/test/file1.txt' },
      { name: 'file2.txt', isDirectory: false, path: '/Users/test/file2.txt' },
      { name: 'src', isDirectory: true, path: '/Users/test/src' },
    ])

    const suggestions = await getLocalSuggestions('ls ', '/Users/test')

    expect(suggestions.length).toBe(3)
    expect(suggestions.every((s) => s.type === 'path')).toBe(true)
  })

  it('returns empty array for empty partial input', async () => {
    const suggestions = await getLocalSuggestions('', '/Users/test')

    expect(suggestions).toEqual([])
  })

  it('returns empty array when readDirectory fails', async () => {
    mockReadDirectory.mockRejectedValue(new Error('Permission denied'))

    const suggestions = await getLocalSuggestions('cd /root', '/Users/test')

    expect(suggestions).toEqual([])
  })

  it('marks directories with trailing slash in description', async () => {
    mockReadDirectory.mockResolvedValue([
      { name: 'src', isDirectory: true, path: '/Users/test/src' },
    ])

    const suggestions = await getLocalSuggestions('cd s', '/Users/test')

    expect(suggestions.length).toBe(1)
    expect(suggestions[0].description).toContain('directory')
  })
})

// ---------------------------------------------------------------------------
// getCommandSuggestions
// ---------------------------------------------------------------------------

describe('getCommandSuggestions', () => {
  it('returns matching commands for "gi"', () => {
    const suggestions = getCommandSuggestions('gi')

    expect(suggestions.length).toBeGreaterThanOrEqual(1)
    expect(suggestions.some((s) => s.text === 'git')).toBe(true)
    expect(suggestions.every((s) => s.type === 'command')).toBe(true)
  })

  it('returns matching commands for "doc"', () => {
    const suggestions = getCommandSuggestions('doc')

    expect(suggestions.length).toBeGreaterThanOrEqual(1)
    expect(suggestions.some((s) => s.text === 'docker')).toBe(true)
  })

  it('returns empty array for empty input', () => {
    const suggestions = getCommandSuggestions('')

    expect(suggestions).toEqual([])
  })

  it('returns empty array for no matches', () => {
    const suggestions = getCommandSuggestions('zzzzzzz')

    expect(suggestions).toEqual([])
  })

  it('includes descriptions for commands', () => {
    const suggestions = getCommandSuggestions('git')

    expect(suggestions.length).toBeGreaterThanOrEqual(1)
    const gitSuggestion = suggestions.find((s) => s.text === 'git')
    expect(gitSuggestion?.description).toBeTruthy()
    expect(gitSuggestion?.description.length).toBeGreaterThan(0)
  })

  it('is case-insensitive', () => {
    const lower = getCommandSuggestions('git')
    const upper = getCommandSuggestions('GIT')

    expect(lower.length).toBe(upper.length)
  })

  it('has confidence scores between 0 and 1', () => {
    const suggestions = getCommandSuggestions('ls')

    suggestions.forEach((s) => {
      expect(s.confidence).toBeGreaterThanOrEqual(0)
      expect(s.confidence).toBeLessThanOrEqual(1)
    })
  })
})

// ---------------------------------------------------------------------------
// getAISuggestions
// ---------------------------------------------------------------------------

describe('getAISuggestions', () => {
  const baseContext: AutocompleteContext = {
    partialInput: 'git sta',
    cwd: '/Users/test/project',
    recentCommands: ['git add .', 'npm install'],
    shellType: 'zsh',
  }

  it('returns parsed suggestions from AI response', async () => {
    mockAiQuery.mockResolvedValue({
      content: JSON.stringify([
        { text: 'git status', description: 'Show working tree status', type: 'ai', confidence: 0.95 },
        { text: 'git stash', description: 'Stash changes', type: 'ai', confidence: 0.85 },
      ]),
      model: 'gpt-4o-mini',
      inputTokens: 20,
      outputTokens: 40,
      latencyMs: 200,
      cost: 0.001,
    })

    const suggestions = await getAISuggestions(baseContext)

    expect(suggestions.length).toBe(2)
    expect(suggestions[0].text).toBe('git status')
    expect(suggestions[0].type).toBe('ai')
    expect(suggestions[0].confidence).toBe(0.95)
  })

  it('handles AI timeout gracefully (returns empty)', async () => {
    mockAiQuery.mockImplementation(
      () => new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('timeout')), 5000)
      }),
    )

    const promise = getAISuggestions(baseContext)
    vi.advanceTimersByTime(5000)
    const suggestions = await promise

    expect(suggestions).toEqual([])
  })

  it('handles malformed JSON response (returns empty)', async () => {
    mockAiQuery.mockResolvedValue({
      content: 'not valid json at all',
      model: 'gpt-4o-mini',
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 100,
      cost: 0,
    })

    const suggestions = await getAISuggestions(baseContext)

    expect(suggestions).toEqual([])
  })

  it('caches recent suggestions (same input within 2s)', async () => {
    mockAiQuery.mockResolvedValue({
      content: JSON.stringify([
        { text: 'git status', description: 'Show status', type: 'ai', confidence: 0.9 },
      ]),
      model: 'gpt-4o-mini',
      inputTokens: 20,
      outputTokens: 10,
      latencyMs: 100,
      cost: 0,
    })

    // First call
    const first = await getAISuggestions(baseContext)
    expect(first.length).toBe(1)
    expect(mockAiQuery).toHaveBeenCalledTimes(1)

    // Second call within 2 seconds — should use cache
    const second = await getAISuggestions(baseContext)
    expect(second.length).toBe(1)
    expect(mockAiQuery).toHaveBeenCalledTimes(1) // NOT called again

    // Advance past cache TTL
    vi.advanceTimersByTime(3000)

    // Third call after cache expires — should call AI again
    const third = await getAISuggestions(baseContext)
    expect(third.length).toBe(1)
    expect(mockAiQuery).toHaveBeenCalledTimes(2)
  })

  it('handles AI returning empty array', async () => {
    mockAiQuery.mockResolvedValue({
      content: '[]',
      model: 'gpt-4o-mini',
      inputTokens: 10,
      outputTokens: 2,
      latencyMs: 50,
      cost: 0,
    })

    const suggestions = await getAISuggestions(baseContext)

    expect(suggestions).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// mergeSuggestions
// ---------------------------------------------------------------------------

describe('mergeSuggestions', () => {
  const localSuggestions: ReadonlyArray<AutocompleteSuggestion> = [
    { text: 'Desktop', description: 'directory', type: 'path', confidence: 1.0 },
    { text: 'Documents', description: 'directory', type: 'path', confidence: 1.0 },
  ]

  const aiSuggestions: ReadonlyArray<AutocompleteSuggestion> = [
    { text: 'docker ps', description: 'List containers', type: 'ai', confidence: 0.9 },
    { text: 'docker-compose up', description: 'Start services', type: 'ai', confidence: 0.85 },
  ]

  it('local suggestions come first', () => {
    const merged = mergeSuggestions(localSuggestions, aiSuggestions)

    expect(merged[0].type).toBe('path')
    expect(merged[1].type).toBe('path')
    expect(merged[2].type).toBe('ai')
  })

  it('AI suggestions are appended after local', () => {
    const merged = mergeSuggestions(localSuggestions, aiSuggestions)

    expect(merged.length).toBe(4)
    expect(merged[2].text).toBe('docker ps')
    expect(merged[3].text).toBe('docker-compose up')
  })

  it('removes duplicates by text', () => {
    const localWithDup: ReadonlyArray<AutocompleteSuggestion> = [
      { text: 'git status', description: 'from path', type: 'command', confidence: 0.8 },
    ]
    const aiWithDup: ReadonlyArray<AutocompleteSuggestion> = [
      { text: 'git status', description: 'from AI', type: 'ai', confidence: 0.9 },
      { text: 'git stash', description: 'Stash changes', type: 'ai', confidence: 0.7 },
    ]

    const merged = mergeSuggestions(localWithDup, aiWithDup)

    // 'git status' should appear only once (local wins)
    const gitStatusCount = merged.filter((s) => s.text === 'git status').length
    expect(gitStatusCount).toBe(1)
    expect(merged.find((s) => s.text === 'git status')?.type).toBe('command')
  })

  it('limits to max 8 suggestions', () => {
    const manyLocal: ReadonlyArray<AutocompleteSuggestion> = Array.from(
      { length: 6 },
      (_, i) => ({
        text: `item-${i}`,
        description: `desc ${i}`,
        type: 'path' as const,
        confidence: 1.0,
      }),
    )
    const manyAI: ReadonlyArray<AutocompleteSuggestion> = Array.from(
      { length: 6 },
      (_, i) => ({
        text: `ai-${i}`,
        description: `ai desc ${i}`,
        type: 'ai' as const,
        confidence: 0.8,
      }),
    )

    const merged = mergeSuggestions(manyLocal, manyAI)

    expect(merged.length).toBe(8)
  })

  it('handles empty arrays', () => {
    const merged = mergeSuggestions([], [])
    expect(merged).toEqual([])
  })

  it('handles only local suggestions', () => {
    const merged = mergeSuggestions(localSuggestions, [])
    expect(merged.length).toBe(2)
  })

  it('handles only AI suggestions', () => {
    const merged = mergeSuggestions([], aiSuggestions)
    expect(merged.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// buildAutocompletePrompt
// ---------------------------------------------------------------------------

describe('buildAutocompletePrompt', () => {
  const context: AutocompleteContext = {
    partialInput: 'git sta',
    cwd: '/Users/test/project',
    recentCommands: ['git add .', 'npm install', 'ls -la'],
    shellType: 'zsh',
  }

  it('includes partial input in the prompt', () => {
    const prompt = buildAutocompletePrompt(context)

    expect(prompt).toContain('git sta')
  })

  it('includes cwd in the prompt', () => {
    const prompt = buildAutocompletePrompt(context)

    expect(prompt).toContain('/Users/test/project')
  })

  it('includes recent commands in the prompt', () => {
    const prompt = buildAutocompletePrompt(context)

    expect(prompt).toContain('git add .')
    expect(prompt).toContain('npm install')
  })

  it('instructs AI to return JSON array', () => {
    const prompt = buildAutocompletePrompt(context)

    expect(prompt).toContain('JSON')
  })

  it('includes shell type', () => {
    const prompt = buildAutocompletePrompt(context)

    expect(prompt).toContain('zsh')
  })
})
