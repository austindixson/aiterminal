import { useEffect, useRef } from 'react';
import './TerminalActivityView.css';

export interface TerminalSession {
  id: string;
  name: string;
  output: string[];
}

export interface TerminalActivityViewProps {
  sessions: TerminalSession[];
}

export function TerminalActivityView({ sessions }: TerminalActivityViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest output
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [sessions]);

  if (sessions.length === 0) {
    return (
      <div className="terminal-activity-view terminal-activity--empty">
        <div className="terminal-activity__empty-state">
          No active terminal sessions
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="terminal-activity-view">
      {sessions.map((session) => (
        <div key={session.id} className="terminal-activity__session">
          <div className="terminal-activity__session-name">
            {session.name}
          </div>
          {session.output.length > 0 ? (
            <pre className="terminal-activity__output">
              {session.output.join('')}
            </pre>
          ) : (
            <div className="terminal-activity__no-output">
              Waiting for output...
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
