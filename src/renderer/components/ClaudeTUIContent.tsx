/**
 * ClaudeTUIContent — Displays captured Claude Code CLI TUI output in chat sidebar.
 *
 * Renders parsed code snippets with cursor positions using CursorSnippet component.
 * Shows raw output for non-code sections.
 */

import React, { useMemo, useRef, useEffect } from 'react'
import { CursorSnippet } from './CursorSnippet'
import type { ClaudeTUIOutput, ClaudeCursorSnippet } from '@/types/chat'
import './claude-tui-content.css'

export interface ClaudeTUIContentProps {
  readonly output: ClaudeTUIOutput | null
  readonly snippets: ReadonlyArray<ClaudeCursorSnippet>
}

export const ClaudeTUIContent: React.FC<ClaudeTUIContentProps> = ({
  output,
  snippets,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [output, snippets])

  // Parse content into sections (text vs code)
  const sections = useMemo(() => {
    if (!output) return []

    const lines = output.content.split('\n')
    const sections: Array<{
      type: 'text' | 'code'
      content: string
      snippet?: ClaudeCursorSnippet
    }> = []

    let currentText: string[] = []

    for (const line of lines) {
      // Check if this line matches any snippet
      const matchingSnippet = snippets.find(s => s.code.includes(line))

      if (matchingSnippet) {
        // Flush any pending text
        if (currentText.length > 0) {
          sections.push({
            type: 'text',
            content: currentText.join('\n'),
          })
          currentText = []
        }

        // Add code section
        sections.push({
          type: 'code',
          content: matchingSnippet.code,
          snippet: matchingSnippet,
        })
      } else {
        currentText.push(line)
      }
    }

    // Flush remaining text
    if (currentText.length > 0) {
      sections.push({
        type: 'text',
        content: currentText.join('\n'),
      })
    }

    return sections
  }, [output, snippets])

  if (!output) {
    return (
      <div className="claude-tui-content claude-tui-content--empty">
        <div className="claude-tui-content__placeholder">
          No Claude Code output captured yet
        </div>
      </div>
    )
  }

  return (
    <div className="claude-tui-content" ref={scrollRef}>
      <div className="claude-tui-content__header">
        <span className="claude-tui-content__status">
          {output.isActive ? (
            <span className="claude-tui-content__status-indicator claude-tui-content__status-indicator--active">
              ● Live
            </span>
          ) : (
            <span className="claude-tui-content__status-indicator">
              ○ Captured
            </span>
          )}
        </span>
        <span className="claude-tui-content__timestamp">
          {new Date(output.timestamp).toLocaleTimeString()}
        </span>
      </div>

      <div className="claude-tui-content__sections">
        {sections.map((section, idx) => {
          if (section.type === 'code' && section.snippet) {
            return (
              <div key={idx} className="claude-tui-content__section">
                <CursorSnippet
                  code={section.snippet.code}
                  language={section.snippet.language}
                  cursorLine={section.snippet.cursorLine}
                  active={output.isActive}
                />
              </div>
            )
          }

          return (
            <div key={idx} className="claude-tui-content__section">
              <pre className="claude-tui-content__text">{section.content}</pre>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ClaudeTUIContent
