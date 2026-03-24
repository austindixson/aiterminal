import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  extractMentions,
  loadFileContext,
  buildContextBlock,
  searchFiles,
  replaceMentionsWithContext,
} from './file-context-service'
import type { FileContext } from '@/types/file-context'

// ---------------------------------------------------------------------------
// Mock electronAPI for loadFileContext
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn()
const mockReadDirectoryTree = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as Record<string, unknown>).window = {
    electronAPI: {
      readFile: mockReadFile,
      readDirectoryTree: mockReadDirectoryTree,
    },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// extractMentions
// ---------------------------------------------------------------------------

describe('extractMentions', () => {
  it('extracts a single @mention from text', () => {
    const result = extractMentions('@src/main.ts is the entry')

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('src/main.ts')
    expect(result[0].raw).toBe('@src/main.ts')
    expect(result[0].startIndex).toBe(0)
    expect(result[0].endIndex).toBe(12)
  })

  it('extracts multiple @mentions from text', () => {
    const result = extractMentions('look at @package.json and @tsconfig.json')

    expect(result).toHaveLength(2)
    expect(result[0].path).toBe('package.json')
    expect(result[1].path).toBe('tsconfig.json')
  })

  it('returns empty array when no @ is present', () => {
    const result = extractMentions('just a regular message')

    expect(result).toEqual([])
  })

  it('returns empty array for @ alone', () => {
    const result = extractMentions('@ ')

    expect(result).toEqual([])
  })

  it('stops at space — does not include spaces in path', () => {
    const result = extractMentions('@src/main.ts some text after')

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('src/main.ts')
  })

  it('handles dotfiles like @.env', () => {
    const result = extractMentions('check @.env for secrets')

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('.env')
  })

  it('handles nested paths with multiple dots', () => {
    const result = extractMentions('@src/utils/file.test.ts')

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('src/utils/file.test.ts')
  })

  it('handles @ at end of text', () => {
    const result = extractMentions('see @')

    expect(result).toEqual([])
  })

  it('correctly reports startIndex and endIndex for mid-text mentions', () => {
    const result = extractMentions('check @src/index.ts now')

    expect(result).toHaveLength(1)
    expect(result[0].startIndex).toBe(6)
    expect(result[0].endIndex).toBe(19)
  })

  it('handles hyphens in path', () => {
    const result = extractMentions('@my-component/index.tsx')

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('my-component/index.tsx')
  })
})

// ---------------------------------------------------------------------------
// loadFileContext
// ---------------------------------------------------------------------------

describe('loadFileContext', () => {
  it('returns FileContext with content, language, and charCount', async () => {
    mockReadFile.mockResolvedValue({
      content: 'const x = 1;\nexport default x;',
      size: 30,
    })

    const result = await loadFileContext('src/index.ts')

    expect(result.path).toBe('src/index.ts')
    expect(result.name).toBe('index.ts')
    expect(result.content).toBe('const x = 1;\nexport default x;')
    expect(result.language).toBe('typescript')
    expect(result.truncated).toBe(false)
    expect(result.charCount).toBe(30)
  })

  it('truncates at maxChars with truncated=true', async () => {
    const longContent = 'a'.repeat(10000)
    mockReadFile.mockResolvedValue({
      content: longContent,
      size: 10000,
    })

    const result = await loadFileContext('src/big.ts', 8000)

    expect(result.content).toHaveLength(8000)
    expect(result.truncated).toBe(true)
    expect(result.charCount).toBe(10000)
  })

  it('defaults maxChars to 8000', async () => {
    const longContent = 'b'.repeat(9000)
    mockReadFile.mockResolvedValue({
      content: longContent,
      size: 9000,
    })

    const result = await loadFileContext('src/big.ts')

    expect(result.content).toHaveLength(8000)
    expect(result.truncated).toBe(true)
  })

  it('detects language from file extension', async () => {
    mockReadFile.mockResolvedValue({ content: 'body {}', size: 7 })
    const result = await loadFileContext('styles/main.css')
    expect(result.language).toBe('css')
  })

  it('returns error context for missing files', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'))

    const result = await loadFileContext('missing.ts')

    expect(result.content).toContain('Error')
    expect(result.charCount).toBe(0)
  })

  it('detects javascript for .js files', async () => {
    mockReadFile.mockResolvedValue({ content: 'var x = 1;', size: 10 })
    const result = await loadFileContext('script.js')
    expect(result.language).toBe('javascript')
  })

  it('detects json for .json files', async () => {
    mockReadFile.mockResolvedValue({ content: '{}', size: 2 })
    const result = await loadFileContext('data.json')
    expect(result.language).toBe('json')
  })
})

// ---------------------------------------------------------------------------
// buildContextBlock
// ---------------------------------------------------------------------------

describe('buildContextBlock', () => {
  it('wraps each file in fenced code blocks', () => {
    const contexts: ReadonlyArray<FileContext> = [
      {
        path: 'src/index.ts',
        name: 'index.ts',
        content: 'const x = 1;',
        language: 'typescript',
        truncated: false,
        charCount: 12,
      },
    ]

    const result = buildContextBlock(contexts)

    expect(result).toContain('```src/index.ts')
    expect(result).toContain('const x = 1;')
    expect(result).toContain('```')
  })

  it('includes file size info', () => {
    const contexts: ReadonlyArray<FileContext> = [
      {
        path: 'src/index.ts',
        name: 'index.ts',
        content: 'const x = 1;',
        language: 'typescript',
        truncated: false,
        charCount: 12,
      },
    ]

    const result = buildContextBlock(contexts)

    expect(result).toContain('12')
  })

  it('shows truncated indicator when file was cut', () => {
    const contexts: ReadonlyArray<FileContext> = [
      {
        path: 'src/big.ts',
        name: 'big.ts',
        content: 'a'.repeat(8000),
        language: 'typescript',
        truncated: true,
        charCount: 12000,
      },
    ]

    const result = buildContextBlock(contexts)

    expect(result).toMatch(/truncated/i)
  })

  it('handles multiple files', () => {
    const contexts: ReadonlyArray<FileContext> = [
      {
        path: 'src/a.ts',
        name: 'a.ts',
        content: 'const a = 1;',
        language: 'typescript',
        truncated: false,
        charCount: 12,
      },
      {
        path: 'src/b.ts',
        name: 'b.ts',
        content: 'const b = 2;',
        language: 'typescript',
        truncated: false,
        charCount: 12,
      },
    ]

    const result = buildContextBlock(contexts)

    expect(result).toContain('```src/a.ts')
    expect(result).toContain('```src/b.ts')
    expect(result).toContain('const a = 1;')
    expect(result).toContain('const b = 2;')
  })

  it('returns empty string for empty array', () => {
    const result = buildContextBlock([])
    expect(result).toBe('')
  })
})

// ---------------------------------------------------------------------------
// searchFiles
// ---------------------------------------------------------------------------

describe('searchFiles', () => {
  beforeEach(() => {
    mockReadDirectoryTree.mockResolvedValue([
      {
        name: 'src',
        path: '/project/src',
        isDirectory: true,
        isHidden: false,
        size: 0,
        extension: null,
        children: [
          {
            name: 'main.ts',
            path: '/project/src/main.ts',
            isDirectory: false,
            isHidden: false,
            size: 100,
            extension: '.ts',
          },
          {
            name: 'main',
            path: '/project/src/main',
            isDirectory: true,
            isHidden: false,
            size: 0,
            extension: null,
            children: [
              {
                name: 'index.ts',
                path: '/project/src/main/index.ts',
                isDirectory: false,
                isHidden: false,
                size: 200,
                extension: '.ts',
              },
            ],
          },
        ],
      },
      {
        name: 'package.json',
        path: '/project/package.json',
        isDirectory: false,
        isHidden: false,
        size: 500,
        extension: '.json',
      },
      {
        name: 'tsconfig.json',
        path: '/project/tsconfig.json',
        isDirectory: false,
        isHidden: false,
        size: 300,
        extension: '.json',
      },
    ])
  })

  it('"main" matches "main.ts" and "src/main/index.ts"', async () => {
    const results = await searchFiles('main', '/project')

    const paths = results.map((r) => r.path)
    expect(paths).toContain('/project/src/main.ts')
    expect(paths).toContain('/project/src/main/index.ts')
  })

  it('search is case insensitive', async () => {
    const results = await searchFiles('MAIN', '/project')

    const paths = results.map((r) => r.path)
    expect(paths).toContain('/project/src/main.ts')
  })

  it('returns results sorted by relevance (exact name match first)', async () => {
    const results = await searchFiles('main.ts', '/project')

    expect(results.length).toBeGreaterThanOrEqual(1)
    // Exact filename match should be first
    expect(results[0].name).toBe('main.ts')
  })

  it('limits to 10 results', async () => {
    // Create a tree with many files
    const manyFiles = Array.from({ length: 20 }, (_, i) => ({
      name: `file${i}.ts`,
      path: `/project/file${i}.ts`,
      isDirectory: false,
      isHidden: false,
      size: 100,
      extension: '.ts',
    }))

    mockReadDirectoryTree.mockResolvedValue(manyFiles)

    const results = await searchFiles('file', '/project')

    expect(results.length).toBeLessThanOrEqual(10)
  })

  it('returns empty array for no matches', async () => {
    const results = await searchFiles('nonexistent-xyz', '/project')

    expect(results).toEqual([])
  })

  it('includes relative path in results', async () => {
    const results = await searchFiles('main.ts', '/project')

    const mainResult = results.find((r) => r.name === 'main.ts')
    expect(mainResult).toBeDefined()
    expect(mainResult!.relativePath).toContain('src/main.ts')
  })
})

// ---------------------------------------------------------------------------
// replaceMentionsWithContext
// ---------------------------------------------------------------------------

describe('replaceMentionsWithContext', () => {
  it('replaces @file.ts with "[file.ts attached]"', () => {
    const contexts: ReadonlyArray<FileContext> = [
      {
        path: 'file.ts',
        name: 'file.ts',
        content: 'const x = 1;',
        language: 'typescript',
        truncated: false,
        charCount: 12,
      },
    ]

    const result = replaceMentionsWithContext('@file.ts check this', contexts)

    expect(result).toContain('[file.ts attached]')
    expect(result).not.toContain('@file.ts')
  })

  it('replaces multiple mentions', () => {
    const contexts: ReadonlyArray<FileContext> = [
      {
        path: 'a.ts',
        name: 'a.ts',
        content: 'a',
        language: 'typescript',
        truncated: false,
        charCount: 1,
      },
      {
        path: 'b.ts',
        name: 'b.ts',
        content: 'b',
        language: 'typescript',
        truncated: false,
        charCount: 1,
      },
    ]

    const result = replaceMentionsWithContext('see @a.ts and @b.ts', contexts)

    expect(result).toContain('[a.ts attached]')
    expect(result).toContain('[b.ts attached]')
  })

  it('leaves text unchanged when no mentions match contexts', () => {
    const result = replaceMentionsWithContext('no mentions here', [])

    expect(result).toBe('no mentions here')
  })

  it('leaves unmatched @mentions as-is', () => {
    const contexts: ReadonlyArray<FileContext> = [
      {
        path: 'a.ts',
        name: 'a.ts',
        content: 'a',
        language: 'typescript',
        truncated: false,
        charCount: 1,
      },
    ]

    const result = replaceMentionsWithContext('@a.ts and @unknown.ts', contexts)

    expect(result).toContain('[a.ts attached]')
    expect(result).toContain('@unknown.ts')
  })
})
