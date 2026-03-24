/**
 * Tests for useAgent — React hook managing agent state, plan lifecycle,
 * and file operation approval/execution.
 *
 * Written TDD-first: all tests are defined before the implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useAgent } from './useAgent'

// ---------------------------------------------------------------------------
// Mock: window.electronAPI
// ---------------------------------------------------------------------------

const mockAiQuery = vi.fn().mockResolvedValue({
  content: `Here is the plan:
[FILE:src/greeting.ts]
export function greet(name: string) {
  return \`Hello, \${name}\`
}
[/FILE]`,
  model: 'test-model',
  inputTokens: 10,
  outputTokens: 50,
  latencyMs: 200,
  cost: 0.001,
})

const mockWriteFile = vi.fn().mockResolvedValue({ success: true })
const mockDeleteFile = vi.fn().mockResolvedValue({ success: true })

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as any).electronAPI = {
    aiQuery: mockAiQuery,
    writeFile: mockWriteFile,
    deleteFile: mockDeleteFile,
    readDirectory: vi.fn().mockResolvedValue([]),
    readDirectoryTree: vi.fn().mockResolvedValue([]),
    executeCommand: vi.fn(),
    getThemes: vi.fn(),
    setTheme: vi.fn(),
    getThemeConfig: vi.fn(),
    onPtyData: vi.fn(),
    writeToPty: vi.fn(),
    resizePty: vi.fn(),
    readFile: vi.fn().mockResolvedValue({ content: '', size: 0 }),
    getAutocompleteContext: vi.fn().mockResolvedValue({ cwd: '/', recentCommands: [] }),
  }
})

afterEach(() => {
  cleanup()
  delete (window as any).electronAPI
})

// ===========================================================================
// Tests
// ===========================================================================

describe('useAgent', () => {
  // -------------------------------------------------------------------------
  // 1. Initial state: not active, no plan
  // -------------------------------------------------------------------------

  it('returns initial state with isActive false and no current plan', () => {
    const { result } = renderHook(() => useAgent())

    expect(result.current.state.isActive).toBe(false)
    expect(result.current.state.currentPlan).toBeNull()
    expect(result.current.state.history).toEqual([])
  })

  // -------------------------------------------------------------------------
  // 2. startAgent sends to AI, parses response into plan
  // -------------------------------------------------------------------------

  it('startAgent sends request to AI and creates a plan from the response', async () => {
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.startAgent('Create a greeting module')
    })

    expect(mockAiQuery).toHaveBeenCalled()
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.currentPlan).not.toBeNull()
    expect(result.current.state.currentPlan!.status).toBe('awaiting_approval')
    expect(result.current.state.currentPlan!.operations.length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // 3. approveAll marks all ops approved
  // -------------------------------------------------------------------------

  it('approveAll marks all operations as approved', async () => {
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.startAgent('Create files')
    })

    act(() => {
      result.current.approveAll()
    })

    const plan = result.current.state.currentPlan!
    expect(plan.operations.every((op) => op.status === 'approved')).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 4. rejectAll marks all rejected, cancels plan
  // -------------------------------------------------------------------------

  it('rejectAll marks all operations as rejected and cancels the plan', async () => {
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.startAgent('Create files')
    })

    act(() => {
      result.current.rejectAll()
    })

    const plan = result.current.state.currentPlan!
    expect(plan.operations.every((op) => op.status === 'rejected')).toBe(true)
    expect(plan.status).toBe('cancelled')
  })

  // -------------------------------------------------------------------------
  // 5. approveOperation approves single op
  // -------------------------------------------------------------------------

  it('approveOperation approves a single operation by ID', async () => {
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.startAgent('Create files')
    })

    const opId = result.current.state.currentPlan!.operations[0].id

    act(() => {
      result.current.approveOperation(opId)
    })

    const op = result.current.state.currentPlan!.operations.find(
      (o) => o.id === opId,
    )
    expect(op!.status).toBe('approved')
  })

  // -------------------------------------------------------------------------
  // 6. rejectOperation rejects single op
  // -------------------------------------------------------------------------

  it('rejectOperation rejects a single operation by ID', async () => {
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.startAgent('Create files')
    })

    const opId = result.current.state.currentPlan!.operations[0].id

    act(() => {
      result.current.rejectOperation(opId)
    })

    const op = result.current.state.currentPlan!.operations.find(
      (o) => o.id === opId,
    )
    expect(op!.status).toBe('rejected')
  })

  // -------------------------------------------------------------------------
  // 7. execute applies all approved ops
  // -------------------------------------------------------------------------

  it('execute applies all approved operations', async () => {
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.startAgent('Create files')
    })

    act(() => {
      result.current.approveAll()
    })

    await act(async () => {
      await result.current.execute()
    })

    expect(mockWriteFile).toHaveBeenCalled()
    const plan = result.current.state.currentPlan!
    expect(plan.status).toBe('complete')
    expect(plan.operations.every((op) => op.status === 'applied')).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 8. execute skips rejected ops
  // -------------------------------------------------------------------------

  it('execute skips rejected operations', async () => {
    mockAiQuery.mockResolvedValueOnce({
      content: `[FILE:src/keep.ts]
export const keep = true
[/FILE]
[FILE:src/skip.ts]
export const skip = true
[/FILE]`,
      model: 'test-model',
      inputTokens: 10,
      outputTokens: 50,
      latencyMs: 200,
      cost: 0.001,
    })

    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.startAgent('Create two files')
    })

    const ops = result.current.state.currentPlan!.operations
    expect(ops).toHaveLength(2)

    // Approve first, reject second
    act(() => {
      result.current.approveOperation(ops[0].id)
      result.current.rejectOperation(ops[1].id)
    })

    await act(async () => {
      await result.current.execute()
    })

    // writeFile should only be called once (for the approved file)
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    expect(mockWriteFile).toHaveBeenCalledWith('src/keep.ts', expect.any(String))
  })

  // -------------------------------------------------------------------------
  // 9. cancel sets plan to cancelled
  // -------------------------------------------------------------------------

  it('cancel sets the plan status to cancelled', async () => {
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.startAgent('Create files')
    })

    act(() => {
      result.current.cancel()
    })

    expect(result.current.state.currentPlan!.status).toBe('cancelled')
  })

  // -------------------------------------------------------------------------
  // 10. Adds completed plans to history
  // -------------------------------------------------------------------------

  it('adds completed plans to history', async () => {
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.startAgent('Create files')
    })

    act(() => {
      result.current.approveAll()
    })

    await act(async () => {
      await result.current.execute()
    })

    expect(result.current.state.history).toHaveLength(1)
    expect(result.current.state.history[0].status).toBe('complete')
  })

  // -------------------------------------------------------------------------
  // 11. State immutability — plan updates return new references
  // -------------------------------------------------------------------------

  it('uses immutable state updates (approveAll returns new plan reference)', async () => {
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.startAgent('Create files')
    })

    const planBefore = result.current.state.currentPlan

    act(() => {
      result.current.approveAll()
    })

    const planAfter = result.current.state.currentPlan
    expect(planBefore).not.toBe(planAfter)
  })

  // -------------------------------------------------------------------------
  // 12. startAgent when no AI response returns no operations
  // -------------------------------------------------------------------------

  it('startAgent with AI returning no file tags creates a plan with no operations', async () => {
    mockAiQuery.mockResolvedValueOnce({
      content: 'I cannot help with that request.',
      model: 'test-model',
      inputTokens: 5,
      outputTokens: 10,
      latencyMs: 100,
      cost: 0,
    })

    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.startAgent('Do nothing')
    })

    expect(result.current.state.currentPlan).not.toBeNull()
    expect(result.current.state.currentPlan!.operations).toHaveLength(0)
  })
})
