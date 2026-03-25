/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useAgentLoop.test.ts
 * Module: renderer/hooks
 * Purpose: Tests for agent loop hook
 * Dependencies: vitest, react-testing-library
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useAgentLoop.ts
 * Keywords: tests, agent-loop, react-hooks
 * Last Updated: 2026-03-24
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAgentLoop } from './useAgentLoop';

// Mock window.electronAPI
const mockAgentStart = vi.fn().mockResolvedValue({
  success: true,
  runId: 'test-run-id',
  sessionId: 'test-session-id',
  acceptedAt: Date.now()
});

const mockAgentAbort = vi.fn().mockResolvedValue({
  success: true,
  message: 'Agent aborted'
});

Object.defineProperty(window, 'electronAPI', {
  value: {
    agentStart: mockAgentStart,
    agentAbort: mockAgentAbort,
    onAgentEvent: vi.fn(() => vi.fn()),
    onAgentComplete: vi.fn(() => vi.fn()),
    onAgentError: vi.fn(() => vi.fn())
  },
  writable: true
});

describe('useAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when disabled', () => {
    it('should not start agent', async () => {
      const { result } = renderHook(() => useAgentLoop({ enabled: false }));

      const response = await result.current.startAgent('test task');

      expect(response.success).toBe(false);
      expect(response.error).toBe('Agent mode is not enabled');
      expect(mockAgentStart).not.toHaveBeenCalled();
    });

    it('should clear state when disabled', async () => {
      const { result, rerender } = renderHook(
        ({ enabled }) => useAgentLoop({ enabled }),
        { initialProps: { enabled: true } }
      );

      await result.current.startAgent('test');
      await waitFor(() => expect(result.current.isRunning).toBe(true));

      // Rerender with enabled: false
      rerender({ enabled: false });

      await waitFor(() => {
        expect(result.current.isRunning).toBe(false);
        expect(result.current.activeIntern).toBeNull();
      });
    });
  });

  describe('when enabled', () => {
    it('should start agent with task', async () => {
      const { result } = renderHook(() => useAgentLoop({ enabled: true }));

      const response = await result.current.startAgent('Fix the login bug');

      expect(response.success).toBe(true);
      expect(response.runId).toBe('test-run-id');
      expect(mockAgentStart).toHaveBeenCalledWith({
        task: 'Fix the login bug',
        config: {}
      });
    });

    it('should set running state on start', async () => {
      const { result } = renderHook(() => useAgentLoop({ enabled: true }));

      await result.current.startAgent('Test task');
      await waitFor(() => expect(result.current.isRunning).toBe(true));
    });

    it('should handle start errors', async () => {
      mockAgentStart.mockResolvedValueOnce({
        success: false,
        error: 'Failed to start'
      });

      const { result } = renderHook(() => useAgentLoop({ enabled: true }));

      const response = await result.current.startAgent('Test');

      expect(response.success).toBe(false);
      expect(response.error).toBe('Failed to start');
      expect(result.current.isRunning).toBe(false);
    });

    it('should abort agent', async () => {
      const { result } = renderHook(() => useAgentLoop({ enabled: true }));

      await result.current.startAgent('Test');
      const abortResponse = await result.current.abortAgent('test-run-id');

      expect(abortResponse.success).toBe(true);
      expect(mockAgentAbort).toHaveBeenCalledWith({ runId: 'test-run-id' });
    });

    it('should clear events', () => {
      const { result } = renderHook(() => useAgentLoop({ enabled: true }));

      // Simulate some events
      result.current.clearEvents();

      expect(result.current.error).toBeNull();
    });
  });
});
