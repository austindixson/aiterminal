import React, { useMemo } from 'react';
import './cursor-snippet.css';

/**
 * Props for CursorSnippet component
 */
export interface CursorSnippetProps {
  /** Code content to display */
  code: string;
  /** Programming language for syntax highlighting */
  language: string;
  /** 1-based line number where cursor appears (0 = no cursor) */
  cursorLine?: number;
  /** Whether the snippet is currently active/focused */
  active?: boolean;
}

/**
 * CursorSnippet - Minimal code snippet renderer with cursor indicator
 * Inspired by Claude Code CLI's output aesthetic
 */
export const CursorSnippet: React.FC<CursorSnippetProps> = ({
  code,
  language,
  cursorLine = 0,
  active = true
}) => {
  const lines = useMemo(() => code.split('\n'), [code]);

  // Calculate max line number width for alignment
  const maxLineNumberWidth = lines.length.toString().length;

  // Simple syntax highlighting (tokenizes common patterns)
  const highlightLine = (line: string): React.ReactNode => {
    // For now, return plain text - can be extended with proper syntax highlighting
    // This keeps it minimal like Claude Code CLI
    return line;
  };

  return (
    <div className="cursor-snippet" data-language={language} data-active={active}>
      <pre className="cursor-snippet__code">
        <code>
          {lines.map((line, idx) => {
            const lineNum = idx + 1;
            const isCursorLine = cursorLine > 0 && lineNum === cursorLine;

            return (
              <div
                key={idx}
                className={`cursor-snippet__line ${isCursorLine ? 'cursor-snippet__line--cursor' : ''}`}
                data-line-number={lineNum}
              >
                {/* Optional line number */}
                <span className="cursor-snippet__line-number">
                  {lineNum.toString().padStart(maxLineNumberWidth, ' ')}
                </span>

                {/* Line content */}
                <span className="cursor-snippet__line-content">
                  {highlightLine(line)}
                  {/* Blinking cursor indicator */}
                  {isCursorLine && active && (
                    <span className="cursor-snippet__cursor" aria-hidden="true">
                      █
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
};

export default CursorSnippet;
