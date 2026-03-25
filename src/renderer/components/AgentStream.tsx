/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/AgentStream.tsx
 * Module: renderer/components
 * Purpose: Display streaming output from agent loop with intern attribution
 * Dependencies: react
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useAgentLoop.ts
 * Keywords: agent-stream, streaming-output, agent-events, ui-component
 * Last Updated: 2026-03-24
 */

import { useEffect, useRef } from 'react';
import type { AgentEvent } from '../../agent-loop/events';

interface AgentStreamProps {
  events: AgentEvent[];
  className?: string;
}

export function AgentStream({ events, className = '' }: AgentStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Render assistant text
  const assistantText = events
    .filter(e => e.stream === 'assistant')
    .map(e => (e as any).data.text)
    .join('');

  // Render tool calls
  const toolEvents = events.filter(e => e.stream === 'tool');

  // Render lifecycle events
  const lifecycleEvents = events.filter(e => e.stream === 'lifecycle');

  const currentPhase = lifecycleEvents.length > 0
    ? lifecycleEvents[lifecycleEvents.length - 1]
    : null;

  return (
    <div className={`agent-stream ${className}`}>
      {/* Status bar */}
      {currentPhase && (
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border-b border-slate-700 text-sm">
          {currentPhase.data.phase === 'start' && (
            <span className="text-blue-400">Starting agent...</span>
          )}
          {currentPhase.data.phase === 'end' && (
            <span className="text-green-400">✓ Agent completed</span>
          )}
          {currentPhase.data.phase === 'error' && (
            <span className="text-red-400">✗ Agent error: {currentPhase.data.error}</span>
          )}
          {currentPhase.data.intern && (
            <span className="text-slate-500">
              ({currentPhase.data.intern})
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div
        ref={scrollRef}
        className="max-h-96 overflow-y-auto p-4 font-mono text-sm leading-relaxed"
      >
        {/* Tool events */}
        {toolEvents.map((evt, idx) => (
          <div key={idx} className="mb-2 text-slate-500">
            <span className="text-yellow-500">⚙</span>{' '}
            <span className="text-slate-400">{(evt as any).data.toolName}</span>
            {(evt as any).data.status === 'start' && (
              <span className="text-slate-600"> starting...</span>
            )}
            {(evt as any).data.status === 'end' && (
              <span className="text-green-600"> ✓</span>
            )}
          </div>
        ))}

        {/* Assistant output */}
        {assistantText && (
          <div
            ref={outputRef}
            className="text-slate-300 whitespace-pre-wrap"
          >
            {assistantText}
          </div>
        )}

        {/* Handoff events */}
        {events
          .filter(e => e.stream === 'handoff')
          .map((evt, idx) => (
            <div key={`handoff-${idx}`} className="my-2 p-2 bg-purple-900/20 border border-purple-700/30 rounded text-xs">
              <span className="text-purple-400">↪</span>{' '}
              Handing off from {(evt as any).data.fromIntern} to {(evt as any).data.toIntern}
              {(evt as any).data.reason && (
                <span className="text-slate-500">: {(evt as any).data.reason}</span>
              )}
            </div>
          ))
        }
      </div>
    </div>
  );
}
