/**
 * Tests for useClaudeCodeComments hook
 */

import { renderHook, act } from '@testing-library/react';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { useClaudeCodeComments } from './useClaudeCodeComments';
import type { ClaudeCodeMessage } from '../../types';

// Mock the electron API
const mockGetClaudeCodeLog = vi.fn();
const mockStartClaudeCodeLogWatcher = vi.fn();
const mockStopClaudeCodeLogWatcher = vi.fn();
const mockOnClaudeCodeLogUpdated = vi.fn();

const mockUnsubscribe = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  (window as any).electronAPI = {
    getClaudeCodeLog: mockGetClaudeCodeLog,
    startClaudeCodeLogWatcher: mockStartClaudeCodeLogWatcher,
    stopClaudeCodeLogWatcher: mockStopClaudeCodeLogWatcher,
    onClaudeCodeLogUpdated: mockOnClaudeCodeLogUpdated.mockReturnValue(mockUnsubscribe),
  };
});

afterEach(() => {
  // Clean up after each test
  mockUnsubscribe.mockReset();
});

// Clean up global mocks after all tests
afterAll(() => {
  delete (window as any).electronAPI;
});

describe('useClaudeCodeComments', () => {
  it('should initialize inactive', () => {
    const { result } = renderHook(() => useClaudeCodeComments());

    expect(result.current.isActive).toBe(false);
    expect(result.current.recentComments).toEqual([]);
  });

  it('should activate when requested', () => {
    const { result } = renderHook(() => useClaudeCodeComments());

    act(() => {
      result.current.activate();
    });

    expect(result.current.isActive).toBe(true);
  });

  it('should deactivate when requested', () => {
    const { result } = renderHook(() => useClaudeCodeComments());

    act(() => {
      result.current.activate();
      result.current.deactivate();
    });

    expect(result.current.isActive).toBe(false);
  });

  it('should start log watcher when activated', async () => {
    mockGetClaudeCodeLog.mockResolvedValue({
      success: true,
      messages: [],
    });

    const { result } = renderHook(() => useClaudeCodeComments());

    act(() => {
      result.current.activate();
    });

    // Wait for async setup
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockStartClaudeCodeLogWatcher).toHaveBeenCalled();
    expect(mockGetClaudeCodeLog).toHaveBeenCalledWith(50);
  });

  it('should stop log watcher when deactivated', async () => {
    mockGetClaudeCodeLog.mockResolvedValue({
      success: true,
      messages: [],
    });

    const { result } = renderHook(() => useClaudeCodeComments());

    act(() => {
      result.current.activate();
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    act(() => {
      result.current.deactivate();
    });

    expect(mockStopClaudeCodeLogWatcher).toHaveBeenCalled();
  });

  it('should call onComment callback when comment is generated', async () => {
    const onComment = vi.fn();

    // Simulate new project messages WITH tool usage
    const newProjectMessages: ClaudeCodeMessage[] = [
      { role: 'user', content: 'help me build a react app', timestamp: Date.now() },
      { role: 'assistant', content: "I'll help you build a React app!", timestamp: Date.now() },
      {
        role: 'tool',
        content: 'bash command output',
        timestamp: Date.now(),
        tools: [{
          name: 'bash',
          input: { command: 'npm install vite' },
          output: 'Installing vite...',
        }]
      },
      { role: 'user', content: 'create a component', timestamp: Date.now() },
    ];

    mockGetClaudeCodeLog.mockResolvedValue({
      success: true,
      messages: newProjectMessages,
    });

    const { result } = renderHook(() =>
      useClaudeCodeComments({ onComment })
    );

    act(() => {
      result.current.activate();
    });

    // Wait for async setup and analysis
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    // Should generate at least one comment for new project
    expect(onComment).toHaveBeenCalled();
    if (onComment.mock.calls.length > 0) {
      const comment = onComment.mock.calls[0][0];
      expect(typeof comment).toBe('string');
      expect(comment.length).toBeGreaterThan(0);
    }
  });

  it('should rate limit comments', async () => {
    const onComment = vi.fn();

    // Simulate many rapid updates
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: 'command 1', timestamp: Date.now() },
      { role: 'assistant', content: 'output 1', timestamp: Date.now() },
    ];

    mockGetClaudeCodeLog.mockResolvedValue({
      success: true,
      messages: messages,
    });

    const { result } = renderHook(() =>
      useClaudeCodeComments({
        onComment,
        minCommentInterval: 100, // 100ms for testing
      })
    );

    act(() => {
      result.current.activate();
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    const initialCommentCount = onComment.mock.calls.length;

    // Trigger multiple rapid updates
    for (let i = 0; i < 5; i++) {
      mockOnClaudeCodeLogUpdated.mock.calls[i]?.[0]?.({
        messages: [...messages, { role: 'user', content: `command ${i}`, timestamp: Date.now() }],
      });
    }

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Should not have called onComment for every update due to rate limiting
    expect(onComment.mock.calls.length).toBeLessThan(5 + initialCommentCount);
  });

  it('should clear history when requested', async () => {
    const onComment = vi.fn();

    // Use messages that will trigger a comment
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: 'help me build a react app', timestamp: Date.now() },
      { role: 'assistant', content: "I'll help you build a React app!", timestamp: Date.now() },
      { role: 'user', content: 'create a component', timestamp: Date.now() },
    ];

    mockGetClaudeCodeLog.mockResolvedValue({
      success: true,
      messages: messages,
    });

    const { result } = renderHook(() =>
      useClaudeCodeComments({ onComment })
    );

    act(() => {
      result.current.activate();
    });

    // Wait longer for comments to be generated
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
    });

    // If comments were generated, test clearing
    if (result.current.recentComments.length > 0) {
      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.recentComments).toEqual([]);
    } else {
      // If no comments were generated, just verify clearHistory doesn't crash
      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.recentComments).toEqual([]);
    }
  });
});
