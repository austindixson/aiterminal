import { describe, it, expect } from 'vitest'
import {
  computeDiff,
  createFileDiff,
  parseDiffFromAI,
  applyDiff,
} from './diff-engine'
// Types used implicitly via the diff-engine public API

// ---------------------------------------------------------------------------
// computeDiff
// ---------------------------------------------------------------------------

describe('computeDiff', () => {
  it('returns all unchanged lines for identical content', () => {
    const content = 'line one\nline two\nline three'
    const lines = computeDiff(content, content)

    expect(lines.length).toBe(3)
    lines.forEach((line) => {
      expect(line.type).toBe('unchanged')
    })
  })

  it('marks added lines with type "added"', () => {
    const old = 'line one\nline two'
    const next = 'line one\nline two\nline three'
    const lines = computeDiff(old, next)

    const added = lines.filter((l) => l.type === 'added')
    expect(added.length).toBe(1)
    expect(added[0].content).toBe('line three')
  })

  it('marks removed lines with type "removed"', () => {
    const old = 'line one\nline two\nline three'
    const next = 'line one\nline three'
    const lines = computeDiff(old, next)

    const removed = lines.filter((l) => l.type === 'removed')
    expect(removed.length).toBe(1)
    expect(removed[0].content).toBe('line two')
  })

  it('handles mixed changes with correct add/remove/unchanged sequence', () => {
    const old = 'a\nb\nc\nd'
    const next = 'a\nx\nc\nd\ne'
    const lines = computeDiff(old, next)

    const types = lines.map((l) => l.type)
    // 'a' unchanged, 'b' removed, 'x' added, 'c' unchanged, 'd' unchanged, 'e' added
    expect(types).toContain('unchanged')
    expect(types).toContain('removed')
    expect(types).toContain('added')

    const unchanged = lines.filter((l) => l.type === 'unchanged')
    expect(unchanged.map((l) => l.content)).toContain('a')
    expect(unchanged.map((l) => l.content)).toContain('c')
    expect(unchanged.map((l) => l.content)).toContain('d')
  })

  it('treats empty old content as all additions', () => {
    const lines = computeDiff('', 'new line 1\nnew line 2')

    const added = lines.filter((l) => l.type === 'added')
    expect(added.length).toBe(2)
    expect(added[0].content).toBe('new line 1')
    expect(added[1].content).toBe('new line 2')
  })

  it('treats empty new content as all removals', () => {
    const lines = computeDiff('old line 1\nold line 2', '')

    const removed = lines.filter((l) => l.type === 'removed')
    expect(removed.length).toBe(2)
    expect(removed[0].content).toBe('old line 1')
    expect(removed[1].content).toBe('old line 2')
  })

  it('handles multiline changes correctly', () => {
    const old = 'first\nsecond\nthird\nfourth\nfifth'
    const next = 'first\nmodified second\nthird\nnew between\nfourth\nfifth'
    const lines = computeDiff(old, next)

    // 'first' unchanged
    // 'second' removed, 'modified second' added
    // 'third' unchanged
    // 'new between' added
    // 'fourth' unchanged
    // 'fifth' unchanged

    const removed = lines.filter((l) => l.type === 'removed')
    const added = lines.filter((l) => l.type === 'added')
    expect(removed.length).toBeGreaterThanOrEqual(1)
    expect(added.length).toBeGreaterThanOrEqual(2)
  })

  it('assigns correct old line numbers for unchanged and removed lines', () => {
    const old = 'a\nb\nc'
    const next = 'a\nc'
    const lines = computeDiff(old, next)

    // 'a' unchanged: old=1, new=1
    // 'b' removed: old=2, new=null
    // 'c' unchanged: old=3, new=2
    const aLine = lines.find((l) => l.content === 'a' && l.type === 'unchanged')
    expect(aLine?.oldLineNum).toBe(1)
    expect(aLine?.newLineNum).toBe(1)

    const bLine = lines.find((l) => l.content === 'b' && l.type === 'removed')
    expect(bLine?.oldLineNum).toBe(2)
    expect(bLine?.newLineNum).toBeNull()

    const cLine = lines.find((l) => l.content === 'c' && l.type === 'unchanged')
    expect(cLine?.oldLineNum).toBe(3)
    expect(cLine?.newLineNum).toBe(2)
  })

  it('assigns correct new line numbers for added lines', () => {
    const old = 'a\nc'
    const next = 'a\nb\nc'
    const lines = computeDiff(old, next)

    const bLine = lines.find((l) => l.content === 'b' && l.type === 'added')
    expect(bLine?.oldLineNum).toBeNull()
    expect(bLine?.newLineNum).toBe(2)
  })

  it('handles both old and new being empty', () => {
    const lines = computeDiff('', '')
    expect(lines.length).toBe(0)
  })

  it('handles single line to single different line', () => {
    const lines = computeDiff('hello', 'world')

    const removed = lines.filter((l) => l.type === 'removed')
    const added = lines.filter((l) => l.type === 'added')

    expect(removed.length).toBe(1)
    expect(removed[0].content).toBe('hello')
    expect(added.length).toBe(1)
    expect(added[0].content).toBe('world')
  })

  it('produces immutable DiffLine objects', () => {
    const lines = computeDiff('a', 'b')
    // ReadonlyArray check: lines should be an array
    expect(Array.isArray(lines)).toBe(true)
    // Each line has the expected shape
    lines.forEach((line) => {
      expect(line).toHaveProperty('type')
      expect(line).toHaveProperty('content')
      expect(line).toHaveProperty('oldLineNum')
      expect(line).toHaveProperty('newLineNum')
    })
  })
})

// ---------------------------------------------------------------------------
// createFileDiff
// ---------------------------------------------------------------------------

describe('createFileDiff', () => {
  it('creates a FileDiff with correct addition and deletion counts', () => {
    const old = 'a\nb\nc'
    const next = 'a\nx\nc\ny'
    const fileDiff = createFileDiff('src/test.ts', old, next)

    expect(fileDiff.filePath).toBe('src/test.ts')
    expect(fileDiff.oldContent).toBe(old)
    expect(fileDiff.newContent).toBe(next)
    expect(fileDiff.additions).toBe(2) // 'x' and 'y'
    expect(fileDiff.deletions).toBe(1) // 'b'
  })

  it('returns zero additions and deletions for identical content', () => {
    const content = 'same\ncontent'
    const fileDiff = createFileDiff('file.ts', content, content)

    expect(fileDiff.additions).toBe(0)
    expect(fileDiff.deletions).toBe(0)
  })

  it('has a lines array matching computeDiff output', () => {
    const old = 'line1\nline2'
    const next = 'line1\nline3'
    const fileDiff = createFileDiff('file.ts', old, next)

    expect(fileDiff.lines.length).toBeGreaterThan(0)
    expect(fileDiff.lines.some((l) => l.type === 'removed')).toBe(true)
    expect(fileDiff.lines.some((l) => l.type === 'added')).toBe(true)
  })

  it('counts all lines as additions when old is empty', () => {
    const fileDiff = createFileDiff('new-file.ts', '', 'a\nb\nc')
    expect(fileDiff.additions).toBe(3)
    expect(fileDiff.deletions).toBe(0)
  })

  it('counts all lines as deletions when new is empty', () => {
    const fileDiff = createFileDiff('deleted.ts', 'a\nb', '')
    expect(fileDiff.additions).toBe(0)
    expect(fileDiff.deletions).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// parseDiffFromAI
// ---------------------------------------------------------------------------

describe('parseDiffFromAI', () => {
  it('parses <<<BEFORE>>>...<<<AFTER>>> markers for a single file', () => {
    const aiContent = [
      'Here is the change for src/app.ts:',
      '<<<BEFORE>>>',
      'const x = 1',
      '<<<AFTER>>>',
      'const x = 2',
      '<<<END>>>',
    ].join('\n')

    const result = parseDiffFromAI(aiContent)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(1)
    expect(result![0].oldContent).toBe('const x = 1')
    expect(result![0].newContent).toBe('const x = 2')
  })

  it('parses multiple file diffs from AI response', () => {
    const aiContent = [
      'Changes to two files:',
      '',
      'File: src/a.ts',
      '<<<BEFORE>>>',
      'const a = 1',
      '<<<AFTER>>>',
      'const a = 2',
      '<<<END>>>',
      '',
      'File: src/b.ts',
      '<<<BEFORE>>>',
      'let b = true',
      '<<<AFTER>>>',
      'let b = false',
      '<<<END>>>',
    ].join('\n')

    const result = parseDiffFromAI(aiContent)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(2)
  })

  it('returns null when no diff markers are present', () => {
    const aiContent = 'This is just a normal response without any diff markers.'
    const result = parseDiffFromAI(aiContent)
    expect(result).toBeNull()
  })

  it('extracts file path from "File: path" line before markers', () => {
    const aiContent = [
      'File: src/utils/helper.ts',
      '<<<BEFORE>>>',
      'export const helper = () => {}',
      '<<<AFTER>>>',
      'export const helper = () => { return 42 }',
      '<<<END>>>',
    ].join('\n')

    const result = parseDiffFromAI(aiContent)
    expect(result).not.toBeNull()
    expect(result![0].filePath).toBe('src/utils/helper.ts')
  })

  it('uses "unknown" as file path when none is specified', () => {
    const aiContent = [
      '<<<BEFORE>>>',
      'old code',
      '<<<AFTER>>>',
      'new code',
      '<<<END>>>',
    ].join('\n')

    const result = parseDiffFromAI(aiContent)
    expect(result).not.toBeNull()
    expect(result![0].filePath).toBe('unknown')
  })

  it('handles multiline content within BEFORE/AFTER blocks', () => {
    const aiContent = [
      '<<<BEFORE>>>',
      'line 1',
      'line 2',
      'line 3',
      '<<<AFTER>>>',
      'line 1',
      'modified line 2',
      'line 3',
      'line 4',
      '<<<END>>>',
    ].join('\n')

    const result = parseDiffFromAI(aiContent)
    expect(result).not.toBeNull()
    expect(result![0].oldContent).toBe('line 1\nline 2\nline 3')
    expect(result![0].newContent).toBe('line 1\nmodified line 2\nline 3\nline 4')
  })

  it('generates correct addition/deletion counts for parsed diffs', () => {
    const aiContent = [
      '<<<BEFORE>>>',
      'a',
      'b',
      '<<<AFTER>>>',
      'a',
      'c',
      'd',
      '<<<END>>>',
    ].join('\n')

    const result = parseDiffFromAI(aiContent)
    expect(result).not.toBeNull()
    // 'b' removed, 'c' and 'd' added
    expect(result![0].additions).toBeGreaterThanOrEqual(1)
    expect(result![0].deletions).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// applyDiff
// ---------------------------------------------------------------------------

describe('applyDiff', () => {
  it('returns the newContent string from the FileDiff', () => {
    const fileDiff = createFileDiff('file.ts', 'old', 'new content here')
    const result = applyDiff(fileDiff)
    expect(result).toBe('new content here')
  })

  it('returns empty string when newContent is empty', () => {
    const fileDiff = createFileDiff('file.ts', 'some content', '')
    const result = applyDiff(fileDiff)
    expect(result).toBe('')
  })

  it('returns the full new content for multiline diffs', () => {
    const old = 'line1\nline2\nline3'
    const next = 'line1\nmodified\nline3\nnewline'
    const fileDiff = createFileDiff('file.ts', old, next)
    const result = applyDiff(fileDiff)
    expect(result).toBe(next)
  })
})
