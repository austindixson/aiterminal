import { useCallback, useMemo } from 'react'
import type { FC } from 'react'
import type { FilePreviewState } from '@/types/file-preview'
import { highlightLine } from '@/file-preview/syntax-highlighter'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FilePreviewProps {
  readonly state: FilePreviewState
  readonly onClose: () => void
  readonly onScroll?: (position: number) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// FilePreview
// ---------------------------------------------------------------------------

export const FilePreview: FC<FilePreviewProps> = ({ state, onClose, onScroll }) => {
  const { isOpen, fileName, content, language, isLoading, error, lineCount, fileSize } = state

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      onScroll?.(e.currentTarget.scrollTop)
    },
    [onScroll],
  )

  const lines = useMemo(() => {
    if (content === null) return []
    return content.split('\n')
  }, [content])

  if (!isOpen) {
    return null
  }

  return (
    <div className="file-preview">
      {/* Header */}
      <div className="file-preview__header">
        <span className="file-preview__filename" data-testid="file-preview-filename">
          {fileName}
        </span>

        {language !== null && (
          <span className="file-preview__language-badge" data-testid="file-preview-language-badge">
            {language}
          </span>
        )}

        <span className="file-preview__line-count" data-testid="file-preview-line-count">
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </span>

        <span className="file-preview__file-size" data-testid="file-preview-file-size">
          {formatFileSize(fileSize)}
        </span>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          className="file-preview__close-btn"
          onClick={onClose}
          aria-label="Close preview"
        >
          {'\u2715'}
        </button>
      </div>

      {/* Content area */}
      <div className="file-preview__content" onScroll={handleScroll}>
        {isLoading && (
          <div className="file-preview__loading" data-testid="file-preview-loading">
            <span className="file-preview__spinner" />
            Loading...
          </div>
        )}

        {error !== null && !isLoading && (
          <div className="file-preview__error" data-testid="file-preview-error">
            {error}
          </div>
        )}

        {content !== null && !isLoading && error === null && (
          <div className="file-preview__code">
            {lines.map((line, index) => (
              <div className="file-preview__line" key={index}>
                <span
                  className="file-preview__line-number"
                  data-testid="file-preview-line-number"
                >
                  {index + 1}
                </span>
                <span className="file-preview__line-content">
                  {highlightLine(line, language ?? 'plain').map((token, ti) => (
                    <span className={`token-${token.type}`} key={ti}>
                      {token.value}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
