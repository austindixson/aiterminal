/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/FileEditor.tsx
 * Module: renderer/components
 * Purpose: VSCode-style file editor with syntax highlighting and line numbers
 * Dependencies: react, @/file-preview/syntax-highlighter, @/types/file-preview
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/App.tsx
 * Keywords: file-editor, syntax-highlighting, line-numbers, vscode-style
 * Last Updated: 2026-03-25
 */

import { FC, useState, useEffect, useCallback, useMemo } from 'react'
import { detectLanguage, highlightLine } from '@/file-preview/syntax-highlighter'
import type { SyntaxToken } from '@/types/file-preview'

export interface FileEditorProps {
  /** Absolute path to the file */
  readonly filePath: string
  /** Language ID (auto-detected from extension if not provided) */
  readonly language?: string
  /** Read-only mode (future: will support editable mode) */
  readonly readOnly?: boolean
}

const LARGE_FILE_THRESHOLD = 1024 * 1024 // 1MB

/**
 * Get color class for a syntax token type
 */
function getTokenColorClass(type: SyntaxToken['type']): string {
  const colorMap: Record<SyntaxToken['type'], string> = {
    plain: 'file-editor__token--plain',
    keyword: 'file-editor__token--keyword',
    string: 'file-editor__token--string',
    number: 'file-editor__token--number',
    comment: 'file-editor__token--comment',
    operator: 'file-editor__token--operator',
    function: 'file-editor__token--function',
    type: 'file-editor__token--keyword',
  }
  return colorMap[type] || colorMap.plain
}

/**
 * VSCode-style file editor component
 *
 * Features:
 * - Syntax highlighting (reuses file-preview highlighter)
 * - Line numbers with monospace alignment
 * - Read-only display (editable mode planned)
 * - Large file handling with warning
 * - Loading and error states
 * - VSCode-dark color scheme
 */
export const FileEditor: FC<FileEditorProps> = ({
  filePath,
  language: propLanguage,
}) => {
  const [lines, setLines] = useState<ReadonlyArray<string>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLargeFile, setIsLargeFile] = useState(false)

  // Auto-detect language from file extension
  const language = useMemo(() => {
    return propLanguage || detectLanguage(filePath)
  }, [filePath, propLanguage])

  // Load file content on mount
  useEffect(() => {
    let cancelled = false

    const loadFile = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const hasElectronAPI =
          typeof window !== 'undefined' &&
          'electronAPI' in window &&
          window.electronAPI?.readFile

        if (!hasElectronAPI) {
          throw new Error('Electron API not available')
        }

        const result = await window.electronAPI.readFile(filePath)

        if (cancelled) return

        if (result.error) {
          throw new Error(result.error)
        }

        // Check file size
        if (result.size > LARGE_FILE_THRESHOLD) {
          setIsLargeFile(true)
        }

        // Split into lines
        const lineArray = result.content.split('\n')
        setLines(lineArray)
      } catch (err) {
        if (cancelled) return
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadFile()

    return () => {
      cancelled = true
    }
  }, [filePath])

  // Handle line click (future: copy line to clipboard)
  const handleLineClick = useCallback(
    (lineNumber: number, lineContent: string) => {
      // Stretch goal: copy line to clipboard
      console.log(`Line ${lineNumber}: ${lineContent}`)
    },
    [],
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="file-editor file-editor--loading">
        <div className="file-editor__loading">Loading {filePath}...</div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="file-editor file-editor--error">
        <div className="file-editor__error">
          <div className="file-editor__error-icon">⚠️</div>
          <div className="file-editor__error-message">
            <strong>Failed to load file</strong>
            <div>{error}</div>
          </div>
        </div>
      </div>
    )
  }

  // Large file warning
  if (isLargeFile) {
    return (
      <div className="file-editor file-editor--large">
        <div className="file-editor__large-warning">
          <div className="file-editor__warning-icon">⚠️</div>
          <div className="file-editor__warning-message">
            <strong>Large file detected</strong>
            <div>
              This file is larger than 1MB. Display may be slow.
            </div>
          </div>
        </div>
        <div className="file-editor__content file-editor__content--overflow">
          <LineGutter lineCount={lines.length} />
          <CodeContent lines={lines} language={language} onLineClick={handleLineClick} />
        </div>
      </div>
    )
  }

  // Normal display
  return (
    <div className="file-editor">
      <div className="file-editor__content">
        <LineGutter lineCount={lines.length} />
        <CodeContent lines={lines} language={language} onLineClick={handleLineClick} />
      </div>
    </div>
  )
}

/**
 * Line number gutter component
 */
interface LineGutterProps {
  readonly lineCount: number
}

const LineGutter: FC<LineGutterProps> = ({ lineCount }) => {
  // Calculate line number width based on total lines
  const maxLineNumber = lineCount
  const gutterWidth = Math.max(3, maxLineNumber.toString().length + 1)

  return (
    <div
      className="file-editor__gutter"
      style={{ minWidth: `${gutterWidth}ch` }}
      aria-hidden="true"
    >
      {Array.from({ length: lineCount }, (_, i) => (
        <div key={i} className="file-editor__line-number">
          {i + 1}
        </div>
      ))}
    </div>
  )
}

/**
 * Code content with syntax highlighting
 */
interface CodeContentProps {
  readonly lines: ReadonlyArray<string>
  readonly language: string
  readonly onLineClick: (lineNumber: number, lineContent: string) => void
}

const CodeContent: FC<CodeContentProps> = ({ lines, language, onLineClick }) => {
  return (
    <div className="file-editor__code">
      {lines.map((line, lineIndex) => {
        const tokens = highlightLine(line, language)
        const lineNumber = lineIndex + 1

        return (
          <div
            key={lineNumber}
            className="file-editor__line"
            onClick={() => onLineClick(lineNumber, line)}
          >
            {tokens.map((token, tokenIndex) => (
              <span
                key={tokenIndex}
                className={`file-editor__token ${getTokenColorClass(token.type)}`}
              >
                {token.value}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}
