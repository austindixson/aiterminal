/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useAgentLoop.ts
 * Module: renderer/hooks
 * Purpose: Hook for interacting with agent loop (start, stream, abort)
 * Dependencies: react
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/AgentMode.tsx
 * Keywords: agent-loop, react-hook, ipc, agent-api
 * Last Updated: 2026-03-24
 */

import { useState, useCallback, useEffect } from 'react';
import type { AgentEvent, AgentLoopResult } from '../../agent-loop/events';

interface UseAgentLoopOptions {
  enabled?: boolean;
}

interface UseAgentLoopReturn {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  startAgent: (task: string) => Promise<{ success: boolean; runId?: string; error?: string }>;
  abortAgent: (runId: string) => Promise<{ success: boolean; error?: string }>;
  events: AgentEvent[];
  clearEvents: () => void;
  isRunning: boolean;
  activeIntern: string | null;
  setActiveIntern: (intern: string) => void;
  error: string | null;
}

export function useAgentLoop(options: UseAgentLoopOptions = {}): UseAgentLoopReturn {
  const { enabled: initialEnabled = false } = options;

  const [enabled, setEnabled] = useState(initialEnabled);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  // Initialize to 'sora' by default - this ensures the prompt update always has a valid intern
  const [activeIntern, setActiveIntern] = useState<string>('sora');
  const [error, setError] = useState<string | null>(null);

  // Clear events when disabled (but keep the last selected intern)
  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      setIsRunning(false);
      // Don't clear activeIntern - keep it for next time agent mode is enabled
      setError(null);
    }
  }, [enabled]);

  const startAgent = useCallback(async (task: string) => {
    if (!enabled) {
      return {
        success: false,
        error: 'Agent mode is not enabled'
      };
    }

    setError(null);
    setIsRunning(true);

    try {
      const response = await window.electronAPI.agentStart({
        task,
        config: {
          // Use defaults
        }
      });

      if (!response.success) {
        setError(response.error || 'Failed to start agent');
        setIsRunning(false);
        return response;
      }

      return response;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setIsRunning(false);
      return {
        success: false,
        error: errorMessage
      };
    }
  }, [enabled]);

  const abortAgent = useCallback(async (runId: string) => {
    try {
      const response = await window.electronAPI.agentAbort({ runId });
      setIsRunning(false);
      return response;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to abort agent'
      };
    }
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setError(null);
  }, []);

  // Listen for agent events
  useEffect(() => {
    if (!enabled) return;

    const handleEvent = (evt: { stream: string; data: any }) => {
      setEvents(prev => [...prev, evt as AgentEvent]);

      // Update state based on events
      if (evt.stream === 'lifecycle') {
        if (evt.data.phase === 'start') {
          setIsRunning(true);
          setActiveIntern(evt.data.intern || null);
        } else if (evt.data.phase === 'end' || evt.data.phase === 'error') {
          setIsRunning(false);
        }
      }

      if (evt.stream === 'error') {
        setError(evt.data.error);
      }
    };

    const handleComplete = (_data: { runId: string; result: AgentLoopResult }) => {
      setIsRunning(false);
    };

    const handleError = (data: { runId: string; error: string }) => {
      setError(data.error);
      setIsRunning(false);
    };

    const unsubscribeEvent = window.electronAPI.onAgentEvent(handleEvent);
    const unsubscribeComplete = window.electronAPI.onAgentComplete(handleComplete);
    const unsubscribeError = window.electronAPI.onAgentError(handleError);

    return () => {
      unsubscribeEvent();
      unsubscribeComplete();
      unsubscribeError();
    };
  }, [enabled]);

  // Update AI system prompt when agent mode is enabled or intern switches
  // Only update when agent mode is enabled - let chat handle it when disabled
  useEffect(() => {
    if (!enabled) {
      // Don't update prompt when agent mode is disabled - chat will handle it
      return;
    }

    const updatePrompt = async () => {
      try {
        const internToUpdate = activeIntern || 'sora';
        await window.electronAPI.updateInternSystemPrompt(internToUpdate);
        console.log('[useAgentLoop] Agent mode enabled, updated system prompt for intern:', internToUpdate);
      } catch (error) {
        console.error('[useAgentLoop] Failed to update system prompt:', error);
      }
    };

    updatePrompt();
  }, [enabled, activeIntern]);

  return {
    enabled,
    setEnabled,
    startAgent,
    abortAgent,
    events,
    clearEvents,
    isRunning,
    activeIntern,
    setActiveIntern,
    error
  };
}
