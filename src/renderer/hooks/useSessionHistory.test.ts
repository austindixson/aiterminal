import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionHistory } from './useSessionHistory';
import type { ChatMessage } from '@/types/chat';

function createMsg(role: 'user' | 'assistant', content: string, id?: string): ChatMessage {
  return {
    id: id || `msg-${Date.now()}-${Math.random()}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

describe('useSessionHistory', () => {
  describe('snapshot', () => {
    it('creates a snapshot of current messages', () => {
      const { result } = renderHook(() => useSessionHistory());
      const msgs = [createMsg('user', 'hello'), createMsg('assistant', 'hi')];

      let snapId: string;
      act(() => {
        snapId = result.current.snapshot(msgs, 'initial');
      });

      expect(result.current.snapshots).toHaveLength(1);
      expect(result.current.snapshots[0].id).toBe(snapId!);
      expect(result.current.snapshots[0].messages).toHaveLength(2);
      expect(result.current.snapshots[0].label).toBe('initial');
    });

    it('creates multiple snapshots', () => {
      const { result } = renderHook(() => useSessionHistory());

      act(() => {
        result.current.snapshot([createMsg('user', 'first')]);
        result.current.snapshot([createMsg('user', 'first'), createMsg('assistant', 'second')]);
      });

      expect(result.current.snapshots).toHaveLength(2);
    });

    it('snapshots are immutable copies', () => {
      const { result } = renderHook(() => useSessionHistory());
      const msgs = [createMsg('user', 'hello')];

      act(() => {
        result.current.snapshot(msgs);
      });

      // Original array mutation should not affect snapshot
      expect(result.current.snapshots[0].messages).toHaveLength(1);
    });
  });

  describe('revert', () => {
    it('reverts to a previous snapshot', () => {
      const { result } = renderHook(() => useSessionHistory());
      const msgs1 = [createMsg('user', 'hello')];
      const msgs2 = [createMsg('user', 'hello'), createMsg('assistant', 'hi'), createMsg('user', 'edit this')];

      let snap1Id: string;
      act(() => {
        snap1Id = result.current.snapshot(msgs1, 'before edit');
        result.current.snapshot(msgs2, 'after edit');
      });

      let reverted: ReadonlyArray<ChatMessage> | null = null;
      act(() => {
        reverted = result.current.revert(snap1Id!);
      });

      expect(reverted).not.toBeNull();
      expect(reverted!).toHaveLength(1);
      expect(reverted![0].content).toBe('hello');
    });

    it('removes snapshots after the reverted one', () => {
      const { result } = renderHook(() => useSessionHistory());

      let snap1Id: string;
      act(() => {
        snap1Id = result.current.snapshot([createMsg('user', '1')]);
        result.current.snapshot([createMsg('user', '1'), createMsg('user', '2')]);
        result.current.snapshot([createMsg('user', '1'), createMsg('user', '2'), createMsg('user', '3')]);
      });

      expect(result.current.snapshots).toHaveLength(3);

      act(() => {
        result.current.revert(snap1Id!);
      });

      expect(result.current.snapshots).toHaveLength(1);
    });

    it('returns null for invalid snapshot id', () => {
      const { result } = renderHook(() => useSessionHistory());

      let reverted: ReadonlyArray<ChatMessage> | null = null;
      act(() => {
        reverted = result.current.revert('nonexistent');
      });

      expect(reverted).toBeNull();
    });
  });

  describe('fork', () => {
    it('returns messages up to the specified index', () => {
      const { result } = renderHook(() => useSessionHistory());
      const msgs = [
        createMsg('user', 'first'),
        createMsg('assistant', 'second'),
        createMsg('user', 'third'),
        createMsg('assistant', 'fourth'),
      ];

      let forked: ReadonlyArray<ChatMessage>;
      act(() => {
        forked = result.current.fork(msgs, 1);
      });

      expect(forked!).toHaveLength(2);
      expect(forked![0].content).toBe('first');
      expect(forked![1].content).toBe('second');
    });

    it('clamps to valid range', () => {
      const { result } = renderHook(() => useSessionHistory());
      const msgs = [createMsg('user', 'only')];

      let forked: ReadonlyArray<ChatMessage>;
      act(() => {
        forked = result.current.fork(msgs, 100);
      });

      expect(forked!).toHaveLength(1);
    });

    it('handles index 0 (fork from first message)', () => {
      const { result } = renderHook(() => useSessionHistory());
      const msgs = [
        createMsg('user', 'first'),
        createMsg('assistant', 'second'),
      ];

      let forked: ReadonlyArray<ChatMessage>;
      act(() => {
        forked = result.current.fork(msgs, 0);
      });

      expect(forked!).toHaveLength(1);
      expect(forked![0].content).toBe('first');
    });
  });

  describe('canRevert', () => {
    it('is false when no snapshots exist', () => {
      const { result } = renderHook(() => useSessionHistory());
      expect(result.current.canRevert).toBe(false);
    });

    it('is true after creating a snapshot', () => {
      const { result } = renderHook(() => useSessionHistory());

      act(() => {
        result.current.snapshot([createMsg('user', 'test')]);
      });

      expect(result.current.canRevert).toBe(true);
    });
  });

  describe('lastSnapshot', () => {
    it('returns null when empty', () => {
      const { result } = renderHook(() => useSessionHistory());
      expect(result.current.lastSnapshot).toBeNull();
    });

    it('returns the most recent snapshot', () => {
      const { result } = renderHook(() => useSessionHistory());

      act(() => {
        result.current.snapshot([createMsg('user', 'first')], 'snap1');
        result.current.snapshot([createMsg('user', 'second')], 'snap2');
      });

      expect(result.current.lastSnapshot?.label).toBe('snap2');
    });
  });
});
