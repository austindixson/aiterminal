/**
 * useSessionHistory — manages message history with revert and fork capabilities.
 * Enables undo/redo of messages and branching from any point in conversation.
 */

import { useState, useCallback, useRef } from 'react';
import type { ChatMessage } from '@/types/chat';

export interface SessionSnapshot {
  readonly id: string
  readonly messages: ReadonlyArray<ChatMessage>
  readonly timestamp: number
  readonly label?: string
}

export interface UseSessionHistoryReturn {
  /** All snapshots in order */
  readonly snapshots: ReadonlyArray<SessionSnapshot>
  /** Take a snapshot of current messages */
  readonly snapshot: (messages: ReadonlyArray<ChatMessage>, label?: string) => string
  /** Revert to a specific snapshot, returns the messages at that point */
  readonly revert: (snapshotId: string) => ReadonlyArray<ChatMessage> | null
  /** Fork from a specific message index, returns messages up to that point */
  readonly fork: (messages: ReadonlyArray<ChatMessage>, messageIndex: number) => ReadonlyArray<ChatMessage>
  /** Check if revert is possible */
  readonly canRevert: boolean
  /** Get the most recent snapshot */
  readonly lastSnapshot: SessionSnapshot | null
}

let snapshotCounter = 0;

export function useSessionHistory(): UseSessionHistoryReturn {
  const [snapshots, setSnapshots] = useState<ReadonlyArray<SessionSnapshot>>([]);
  const snapshotsRef = useRef(snapshots);
  snapshotsRef.current = snapshots;

  const snapshot = useCallback((messages: ReadonlyArray<ChatMessage>, label?: string): string => {
    const id = `snap-${Date.now()}-${++snapshotCounter}`;
    const snap: SessionSnapshot = {
      id,
      messages: [...messages],
      timestamp: Date.now(),
      label,
    };
    setSnapshots(prev => [...prev, snap]);
    return id;
  }, []);

  const revert = useCallback((snapshotId: string): ReadonlyArray<ChatMessage> | null => {
    const snap = snapshotsRef.current.find(s => s.id === snapshotId);
    if (!snap) return null;

    // Remove all snapshots after this one
    const idx = snapshotsRef.current.indexOf(snap);
    setSnapshots(prev => prev.slice(0, idx + 1));

    return [...snap.messages];
  }, []);

  const fork = useCallback((
    messages: ReadonlyArray<ChatMessage>,
    messageIndex: number,
  ): ReadonlyArray<ChatMessage> => {
    // Fork = take messages up to and including messageIndex
    const clamped = Math.max(0, Math.min(messageIndex, messages.length - 1));
    return messages.slice(0, clamped + 1);
  }, []);

  const canRevert = snapshots.length > 0;
  const lastSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  return {
    snapshots,
    snapshot,
    revert,
    fork,
    canRevert,
    lastSnapshot,
  };
}
