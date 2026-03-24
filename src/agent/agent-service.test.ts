/**
 * Tests for Agent Service — the core logic for parsing AI agent responses,
 * building prompts, creating plans, and applying file operations.
 *
 * Written TDD-first: all tests are defined before the implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseAgentResponse,
  buildAgentPrompt,
  createPlan,
  applyOperation,
} from './agent-service'
import type { FileOperation } from '@/types/agent'

// ---------------------------------------------------------------------------
// Mock: window.electronAPI for file operations
// ---------------------------------------------------------------------------

const mockWriteFile = vi.fn().mockResolvedValue({ success: true })
const mockDeleteFile = vi.fn().mockResolvedValue({ success: true })

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as any).window = {
    electronAPI: {
      writeFile: mockWriteFile,
      deleteFile: mockDeleteFile,
    },
  }
})

// ===========================================================================
// parseAgentResponse
// ===========================================================================

describe('parseAgentResponse', () => {
  // -------------------------------------------------------------------------
  // 1. Single [FILE:path] tag → parses into a FileOperation
  // -------------------------------------------------------------------------

  it('parses a single [FILE:path] tag into a create operation', () => {
    const aiContent = `Here is the file:
[FILE:src/utils/hello.ts]
export function hello() {
  return 'hello'
}
[/FILE]`

    const ops = parseAgentResponse(aiContent)

    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('create')
    expect(ops[0].filePath).toBe('src/utils/hello.ts')
    expect(ops[0].content).toContain("export function hello()")
    expect(ops[0].status).toBe('pending')
    expect(ops[0].id).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // 2. Multiple [FILE] tags → multiple operations
  // -------------------------------------------------------------------------

  it('parses multiple [FILE] tags into multiple operations', () => {
    const aiContent = `Creating two files:
[FILE:src/a.ts]
const a = 1
[/FILE]
Some text in between.
[FILE:src/b.ts]
const b = 2
[/FILE]`

    const ops = parseAgentResponse(aiContent)

    expect(ops).toHaveLength(2)
    expect(ops[0].filePath).toBe('src/a.ts')
    expect(ops[0].content).toContain('const a = 1')
    expect(ops[1].filePath).toBe('src/b.ts')
    expect(ops[1].content).toContain('const b = 2')
  })

  // -------------------------------------------------------------------------
  // 3. [DELETE:path] tag → delete operation
  // -------------------------------------------------------------------------

  it('parses [DELETE:path] tag into a delete operation', () => {
    const aiContent = `Removing the old file:
[DELETE:src/old-module.ts]`

    const ops = parseAgentResponse(aiContent)

    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('delete')
    expect(ops[0].filePath).toBe('src/old-module.ts')
    expect(ops[0].content).toBeUndefined()
    expect(ops[0].status).toBe('pending')
  })

  // -------------------------------------------------------------------------
  // 4. No tags → empty operations array
  // -------------------------------------------------------------------------

  it('returns empty array when no tags are present', () => {
    const aiContent = 'This is just a normal response with no file operations.'

    const ops = parseAgentResponse(aiContent)

    expect(ops).toEqual([])
  })

  // -------------------------------------------------------------------------
  // 5. Handles malformed tags gracefully
  // -------------------------------------------------------------------------

  it('handles malformed tags gracefully (unclosed [FILE])', () => {
    const aiContent = `Here is a broken response:
[FILE:src/broken.ts]
const broken = true
`

    const ops = parseAgentResponse(aiContent)

    // Should not crash — either skip the malformed tag or handle it
    expect(Array.isArray(ops)).toBe(true)
  })

  it('handles empty path in [FILE:] tag gracefully', () => {
    const aiContent = `[FILE:]
some content
[/FILE]`

    const ops = parseAgentResponse(aiContent)

    // Should skip operations with empty paths
    expect(ops.every((op) => op.filePath.length > 0)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 6. Mixed [FILE] and [DELETE] tags
  // -------------------------------------------------------------------------

  it('parses mixed [FILE] and [DELETE] tags correctly', () => {
    const aiContent = `Refactoring:
[FILE:src/new-module.ts]
export const newModule = true
[/FILE]
[DELETE:src/old-module.ts]
[FILE:src/index.ts]
export { newModule } from './new-module'
[/FILE]`

    const ops = parseAgentResponse(aiContent)

    expect(ops).toHaveLength(3)
    expect(ops[0].type).toBe('create')
    expect(ops[0].filePath).toBe('src/new-module.ts')
    expect(ops[1].type).toBe('delete')
    expect(ops[1].filePath).toBe('src/old-module.ts')
    expect(ops[2].type).toBe('create')
    expect(ops[2].filePath).toBe('src/index.ts')
  })

  // -------------------------------------------------------------------------
  // 7. [EDIT:path] tag → edit operation
  // -------------------------------------------------------------------------

  it('parses [EDIT:path] tag into an edit operation', () => {
    const aiContent = `Updating the file:
[EDIT:src/config.ts]
export const config = { debug: false }
[/EDIT]`

    const ops = parseAgentResponse(aiContent)

    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('edit')
    expect(ops[0].filePath).toBe('src/config.ts')
    expect(ops[0].content).toContain('export const config')
  })

  // -------------------------------------------------------------------------
  // 8. Content trimming — leading/trailing whitespace
  // -------------------------------------------------------------------------

  it('trims leading and trailing whitespace from file content', () => {
    const aiContent = `[FILE:src/clean.ts]

  const clean = true

[/FILE]`

    const ops = parseAgentResponse(aiContent)

    expect(ops).toHaveLength(1)
    // Content should be trimmed
    expect(ops[0].content).toBe('const clean = true')
  })
})

// ===========================================================================
// buildAgentPrompt
// ===========================================================================

describe('buildAgentPrompt', () => {
  // -------------------------------------------------------------------------
  // 9. Includes file contents in prompt
  // -------------------------------------------------------------------------

  it('includes file contents in the prompt', () => {
    const prompt = buildAgentPrompt('Add a greeting function', [
      { path: 'src/utils.ts', content: 'export const PI = 3.14' },
    ])

    expect(prompt).toContain('src/utils.ts')
    expect(prompt).toContain('export const PI = 3.14')
    expect(prompt).toContain('Add a greeting function')
  })

  // -------------------------------------------------------------------------
  // 10. Includes system instructions for [FILE] tag format
  // -------------------------------------------------------------------------

  it('includes system instructions for the [FILE] tag format', () => {
    const prompt = buildAgentPrompt('Create a helper', [])

    expect(prompt).toContain('[FILE:')
    expect(prompt).toContain('[/FILE]')
    expect(prompt).toContain('[DELETE:')
  })

  // -------------------------------------------------------------------------
  // 11. Truncates large files (>5000 chars)
  // -------------------------------------------------------------------------

  it('truncates large files over 5000 characters', () => {
    const largeContent = 'x'.repeat(6000)
    const prompt = buildAgentPrompt('Explain', [
      { path: 'src/big.ts', content: largeContent },
    ])

    // Should not contain the full 6000-char content
    expect(prompt.length).toBeLessThan(largeContent.length + 1000)
    expect(prompt).toContain('[truncated]')
  })

  // -------------------------------------------------------------------------
  // 12. Handles empty file list
  // -------------------------------------------------------------------------

  it('handles empty file list gracefully', () => {
    const prompt = buildAgentPrompt('Do something', [])

    expect(prompt).toContain('Do something')
    // Should not crash and still include instructions
    expect(prompt).toContain('[FILE:')
  })
})

// ===========================================================================
// createPlan
// ===========================================================================

describe('createPlan', () => {
  // -------------------------------------------------------------------------
  // 13. All operations start as 'pending'
  // -------------------------------------------------------------------------

  it('creates a plan where all operations start as pending', () => {
    const ops: ReadonlyArray<FileOperation> = [
      {
        id: 'op-1',
        type: 'create',
        filePath: 'src/new.ts',
        content: 'const x = 1',
        description: 'Create new file',
        status: 'pending',
      },
      {
        id: 'op-2',
        type: 'delete',
        filePath: 'src/old.ts',
        description: 'Delete old file',
        status: 'pending',
      },
    ]

    const plan = createPlan('Refactoring plan', ops)

    expect(plan.operations.every((op) => op.status === 'pending')).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 14. Plan starts as 'awaiting_approval'
  // -------------------------------------------------------------------------

  it('creates a plan with status awaiting_approval', () => {
    const plan = createPlan('Test plan', [])

    expect(plan.status).toBe('awaiting_approval')
  })

  // -------------------------------------------------------------------------
  // 15. Has unique ID and timestamp
  // -------------------------------------------------------------------------

  it('creates plans with unique IDs and timestamps', () => {
    const plan1 = createPlan('Plan 1', [])
    const plan2 = createPlan('Plan 2', [])

    expect(plan1.id).toBeDefined()
    expect(plan2.id).toBeDefined()
    expect(plan1.id).not.toBe(plan2.id)
    expect(plan1.createdAt).toBeGreaterThan(0)
    expect(plan2.createdAt).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // 16. Description is preserved
  // -------------------------------------------------------------------------

  it('preserves the plan description', () => {
    const plan = createPlan('My detailed plan description', [])

    expect(plan.description).toBe('My detailed plan description')
  })
})

// ===========================================================================
// applyOperation
// ===========================================================================

describe('applyOperation', () => {
  // -------------------------------------------------------------------------
  // 17. Create: writes new file via IPC
  // -------------------------------------------------------------------------

  it('applies a create operation by writing the file', async () => {
    const op: FileOperation = {
      id: 'op-create',
      type: 'create',
      filePath: 'src/new-file.ts',
      content: 'export const x = 1',
      description: 'Create new file',
      status: 'approved',
    }

    const result = await applyOperation(op)

    expect(mockWriteFile).toHaveBeenCalledWith('src/new-file.ts', 'export const x = 1')
    expect(result.success).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 18. Edit: overwrites with new content
  // -------------------------------------------------------------------------

  it('applies an edit operation by writing the new content', async () => {
    const op: FileOperation = {
      id: 'op-edit',
      type: 'edit',
      filePath: 'src/existing.ts',
      content: 'export const updated = true',
      originalContent: 'export const old = false',
      description: 'Update existing file',
      status: 'approved',
    }

    const result = await applyOperation(op)

    expect(mockWriteFile).toHaveBeenCalledWith(
      'src/existing.ts',
      'export const updated = true',
    )
    expect(result.success).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 19. Delete: removes file via IPC
  // -------------------------------------------------------------------------

  it('applies a delete operation by removing the file', async () => {
    const op: FileOperation = {
      id: 'op-delete',
      type: 'delete',
      filePath: 'src/to-remove.ts',
      description: 'Delete old file',
      status: 'approved',
    }

    const result = await applyOperation(op)

    expect(mockDeleteFile).toHaveBeenCalledWith('src/to-remove.ts')
    expect(result.success).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 20. Returns error on failure
  // -------------------------------------------------------------------------

  it('returns error when file operation fails', async () => {
    mockWriteFile.mockRejectedValueOnce(new Error('Permission denied'))

    const op: FileOperation = {
      id: 'op-fail',
      type: 'create',
      filePath: '/root/forbidden.ts',
      content: 'nope',
      description: 'This should fail',
      status: 'approved',
    }

    const result = await applyOperation(op)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Permission denied')
  })
})
