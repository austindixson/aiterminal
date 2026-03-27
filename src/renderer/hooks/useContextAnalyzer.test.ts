import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContextAnalyzer } from './useContextAnalyzer';
import type { ClaudeCodeMessage } from '../../types';

describe('useContextAnalyzer', () => {
  const mockMessages: ClaudeCodeMessage[] = [
    {
      role: 'user',
      content: 'Help me fix this error',
      timestamp: 1000,
    },
    {
      role: 'assistant',
      content: 'I see the issue - command not found',
      timestamp: 2000,
    },
    {
      role: 'user',
      content: 'What is npm?',
      timestamp: 3000,
    },
  ];

  beforeEach(() => {
    // Reset before each test
  });

  describe('analyzeLog', () => {
    it('should return empty result for no messages', () => {
      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog([]);

      expect(analysis.hasErrors).toBe(false);
      expect(analysis.errorPatterns).toEqual([]);
      expect(analysis.isStuck).toBe(false);
      expect(analysis.confidence).toBe(0);
    });

    it('should detect command not found errors', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: command not found',
          timestamp: 1000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.hasErrors).toBe(true);
      expect(analysis.errorPatterns).toContain('command not found');
      expect(analysis.suggestions.length).toBeGreaterThan(0);
    });

    it('should detect permission denied errors', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: permission denied',
          timestamp: 1000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.hasErrors).toBe(true);
      expect(analysis.errorPatterns).toContain('permission denied');
      expect(analysis.suggestions.some((s) => s.includes('sudo'))).toBe(true);
    });

    it('should detect undefined is not a function errors', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'TypeError: undefined is not a function',
          timestamp: 1000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.hasErrors).toBe(true);
      expect(analysis.errorPatterns).toContain('undefined is not a function');
    });

    it('should detect module not found errors', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: "Error: Cannot find module 'lodash'",
          timestamp: 1000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.hasErrors).toBe(true);
      expect(analysis.errorPatterns).toContain('module not found');
      expect(analysis.suggestions.some((s) => s.includes('npm install'))).toBe(true);
    });

    it('should detect test failures', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Test failed: expect(foo).toBe(bar)',
          timestamp: 1000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.hasErrors).toBe(true);
      expect(analysis.errorPatterns).toContain('test failure');
    });

    it('should detect achievements', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: '✓ All tests passed',
          timestamp: 1000,
        },
        {
          role: 'assistant',
          content: 'Build succeeded',
          timestamp: 2000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.achievements).toContain('tests passing');
      expect(analysis.achievements).toContain('build successful');
    });

    it('should detect confusion from questions', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'user',
          content: 'What is React?',
          timestamp: 1000,
        },
        {
          role: 'user',
          content: 'How do I use hooks?',
          timestamp: 2000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.confusionTopics.length).toBeGreaterThan(0);
    });

    it('should detect stuck state with 3+ consecutive errors', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: command not found',
          timestamp: 1000,
        },
        {
          role: 'assistant',
          content: 'Error: command not found',
          timestamp: 2000,
        },
        {
          role: 'assistant',
          content: 'Error: command not found',
          timestamp: 3000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.isStuck).toBe(true);
      expect(analysis.stuckSeverity).toBe('stuck');
    });

    it('should detect very stuck state with 6+ consecutive errors', () => {
      const messages: ClaudeCodeMessage[] = Array.from({ length: 6 }, (_, i) => ({
        role: 'assistant' as const,
        content: 'Error: command not found',
        timestamp: 1000 + i * 1000,
      }));

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.isStuck).toBe(true);
      expect(analysis.stuckSeverity).toBe('very_stuck');
    });

    it('should calculate positive sentiment with more achievements', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: '✓ Tests passed',
          timestamp: 1000,
        },
        {
          role: 'assistant',
          content: 'Build successful',
          timestamp: 2000,
        },
        {
          role: 'assistant',
          content: 'Deployment complete',
          timestamp: 3000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.sentiment).toBe('positive');
    });

    it('should calculate concerned sentiment with many errors', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: command not found',
          timestamp: 1000,
        },
        {
          role: 'assistant',
          content: 'Error: permission denied',
          timestamp: 2000,
        },
        {
          role: 'assistant',
          content: 'Error: module not found',
          timestamp: 3000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.sentiment).toBe('concerned');
    });

    it('should calculate neutral sentiment with mixed signals', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: command not found',
          timestamp: 1000,
        },
        {
          role: 'assistant',
          content: '✓ Fixed',
          timestamp: 2000,
        },
        {
          role: 'assistant',
          content: 'Error: permission denied',
          timestamp: 3000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.sentiment).toBe('neutral');
    });

    it('should calculate confidence based on message count', () => {
      const fewMessages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: command not found',
          timestamp: 1000,
        },
      ];

      const manyMessages: ClaudeCodeMessage[] = Array.from({ length: 50 }, (_, i) => ({
        role: 'assistant' as const,
        content: i % 2 === 0 ? 'Error: command not found' : '✓ Fixed',
        timestamp: 1000 + i * 1000,
      }));

      const { result } = renderHook(() => useContextAnalyzer());
      const analysisFew = result.current.analyzeLog(fewMessages);
      const analysisMany = result.current.analyzeLog(manyMessages);

      expect(analysisMany.confidence).toBeGreaterThan(analysisFew.confidence);
    });

    it('should track time range', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'user',
          content: 'Start',
          timestamp: 1000,
        },
        {
          role: 'assistant',
          content: 'End',
          timestamp: 5000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.timeRange).toBeDefined();
      expect(analysis.timeRange?.start).toBe(1000);
      expect(analysis.timeRange?.end).toBe(5000);
      expect(analysis.timeRange?.durationMs).toBe(4000);
    });

    it('should provide contextual suggestions for tool usage', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Running command',
          timestamp: 1000,
          tools: Array.from({ length: 6 }, () => ({
            name: 'Bash',
            input: { command: 'ls' },
          })),
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(
        analysis.suggestions.some((s) => s.includes('combining multiple shell commands'))
      ).toBe(true);
    });

    it('should limit suggestions to 8 items', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: command not found',
          timestamp: 1000,
        },
        {
          role: 'assistant',
          content: 'Error: permission denied',
          timestamp: 2000,
        },
        {
          role: 'assistant',
          content: 'Error: module not found',
          timestamp: 3000,
        },
        {
          role: 'assistant',
          content: 'Test failed',
          timestamp: 4000,
        },
        {
          role: 'assistant',
          content: 'Build failed',
          timestamp: 5000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.suggestions.length).toBeLessThanOrEqual(8);
    });

    it('should handle messages with tools', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Editing file',
          timestamp: 1000,
          tools: [
            {
              name: 'Edit',
              input: { file_path: '/path/to/file.ts' },
            },
          ],
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.suggestions.some((s) => s.includes('edited file'))).toBe(true);
    });

    it('should detect network errors', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: fetch failed - connection refused',
          timestamp: 1000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.errorPatterns).toContain('network error');
    });

    it('should detect syntax errors', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'SyntaxError: Unexpected token',
          timestamp: 1000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.errorPatterns).toContain('syntax error');
    });

    it('should detect port in use errors', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: Port 3000 is already in use',
          timestamp: 1000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.errorPatterns).toContain('port in use');
    });
  });

  describe('getLastAnalysis', () => {
    it('should return null initially', () => {
      const { result } = renderHook(() => useContextAnalyzer());

      expect(result.current.getLastAnalysis()).toBeNull();
    });

    it('should return last analysis after analyzeLog', () => {
      const { result } = renderHook(() => useContextAnalyzer());
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: command not found',
          timestamp: 1000,
        },
      ];

      act(() => {
        result.current.analyzeLog(messages);
      });

      const lastAnalysis = result.current.getLastAnalysis();
      expect(lastAnalysis).toBeDefined();
      expect(lastAnalysis?.hasErrors).toBe(true);
    });

    it('should update lastAnalysis on subsequent calls', () => {
      const { result } = renderHook(() => useContextAnalyzer());

      const messages1: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: command not found',
          timestamp: 1000,
        },
      ];

      const messages2: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: '✓ Success',
          timestamp: 1000,
        },
      ];

      act(() => {
        result.current.analyzeLog(messages1);
      });
      expect(result.current.getLastAnalysis()?.hasErrors).toBe(true);

      act(() => {
        result.current.analyzeLog(messages2);
      });
      expect(result.current.getLastAnalysis()?.hasErrors).toBe(false);
      expect(result.current.getLastAnalysis()?.achievements).toContain('tests passing');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined timestamp', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: command not found',
          timestamp: undefined,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.hasErrors).toBe(true);
      expect(analysis.timeRange).toBeUndefined();
    });

    it('should handle empty content', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: '',
          timestamp: 1000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.hasErrors).toBe(false);
      expect(analysis.messageCount).toBe(1);
    });

    it('should handle messages with tools but no content', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: '',
          timestamp: 1000,
          tools: [
            {
              name: 'Read',
              input: { file_path: '/path/to/file.ts' },
            },
          ],
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.messageCount).toBe(1);
    });

    it('should handle special characters in content', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Error: EACCES: permission denied, mkdir \'/usr/local/lib/node_modules\'',
          timestamp: 1000,
        },
      ];

      const { result } = renderHook(() => useContextAnalyzer());
      const analysis = result.current.analyzeLog(messages);

      expect(analysis.errorPatterns).toContain('permission denied');
    });
  });
});
