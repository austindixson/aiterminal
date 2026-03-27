/**
 * EditorColumns — Multi-column split pane container
 *
 * Manages vertical column splitting with resizable dividers.
 * Supports 1-4 columns with flexible width ratios and keyboard shortcuts.
 *
 * Features:
 * - Drag dividers to resize columns
 * - Double-click divider to reset to equal widths
 * - Cmd+\ to add new column
 * - Cmd+Shift+W to close active column
 * - Cmd+1/2/3/4 to focus column by index
 * - Min width constraint (200px per column)
 * - Active column highlight
 */

import { FC, ReactNode, useCallback, useRef, useState, useEffect } from 'react'
import type { EditorColumn } from '@/types/editor-columns'

export interface EditorColumnsProps {
  /** All editor columns */
  readonly columns: ReadonlyArray<EditorColumn>
  /** Currently active column ID */
  readonly activeColumnId: string | null
  /** Called when a column divider is dragged */
  readonly onColumnResize: (columnId: string, newRatio: number) => void
  /** Render function for column content */
  readonly children: (column: EditorColumn) => ReactNode
}

const MIN_COLUMN_WIDTH = 200 // Minimum width in pixels

export const EditorColumns: FC<EditorColumnsProps> = ({
  columns,
  activeColumnId,
  onColumnResize,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragState, setDragState] = useState<{
    dividerIndex: number
    startX: number
    startRatios: number[]
  } | null>(null)

  // Calculate flexible widths based on split ratios
  const calculateWidths = useCallback(
    (containerWidth: number) => {
      if (columns.length === 0) return []

      // Check if any column has a custom split ratio
      const hasCustomRatios = columns.some((col) => col.splitRatio !== null)

      if (!hasCustomRatios) {
        // Equal split
        const equalWidth = containerWidth / columns.length
        return columns.map(() => equalWidth)
      }

      // Calculate widths based on ratios
      const totalRatio = columns.reduce(
        (sum, col) => sum + (col.splitRatio ?? 1 / columns.length),
        0,
      )

      return columns.map((col) => {
        const ratio = col.splitRatio ?? 1 / columns.length
        return (ratio / totalRatio) * containerWidth
      })
    },
    [columns],
  )

  // Convert widths back to ratios for persistence
  const widthsToRatios = useCallback(
    (widths: number[], containerWidth: number) => {
      return widths.map((w) => w / containerWidth)
    },
    [],
  )

  // Handle divider drag start
  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent, dividerIndex: number) => {
      e.preventDefault()

      const container = containerRef.current
      if (!container) return

      const containerWidth = container.clientWidth
      const currentWidths = calculateWidths(containerWidth)

      setDragState({
        dividerIndex,
        startX: e.clientX,
        startRatios: widthsToRatios(currentWidths, containerWidth),
      })

      // Prevent text selection during drag
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
    },
    [calculateWidths, widthsToRatios],
  )

  // Handle mouse move during drag
  useEffect(() => {
    if (!dragState) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return

      const containerWidth = container.clientWidth
      const deltaX = e.clientX - dragState.startX
      const deltaRatio = deltaX / containerWidth

      // Calculate new ratios
      const newRatios = [...dragState.startRatios]
      const leftRatio = newRatios[dragState.dividerIndex]
      const rightRatio = newRatios[dragState.dividerIndex + 1]

      // Adjust ratios (left grows, right shrinks)
      newRatios[dragState.dividerIndex] = Math.max(
        MIN_COLUMN_WIDTH / containerWidth,
        leftRatio + deltaRatio,
      )
      newRatios[dragState.dividerIndex + 1] = Math.max(
        MIN_COLUMN_WIDTH / containerWidth,
        rightRatio - deltaRatio,
      )

      // Check if both columns still meet min width
      const newWidths = newRatios.map((r) => r * containerWidth)
      const leftWidth = newWidths[dragState.dividerIndex]
      const rightWidth = newWidths[dragState.dividerIndex + 1]

      if (leftWidth >= MIN_COLUMN_WIDTH && rightWidth >= MIN_COLUMN_WIDTH) {
        // Update column ratios in state
        const leftColumn = columns[dragState.dividerIndex]
        const rightColumn = columns[dragState.dividerIndex + 1]

        if (leftColumn) {
          onColumnResize(leftColumn.id, newRatios[dragState.dividerIndex])
        }
        if (rightColumn) {
          onColumnResize(rightColumn.id, newRatios[dragState.dividerIndex + 1])
        }
      }
    }

    const handleMouseUp = () => {
      setDragState(null)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState, columns, onColumnResize])

  // Handle double-click on divider to reset to equal widths
  const handleDividerDoubleClick = useCallback(
    (e: React.MouseEvent, dividerIndex: number) => {
      e.preventDefault()

      const leftColumn = columns[dividerIndex]
      const rightColumn = columns[dividerIndex + 1]

      // Reset both columns to null (equal split)
      if (leftColumn) {
        onColumnResize(leftColumn.id, 0) // 0 signals "reset to equal"
      }
      if (rightColumn) {
        onColumnResize(rightColumn.id, 0)
      }
    },
    [columns, onColumnResize],
  )

  if (columns.length === 0) {
    return (
      <div className="editor-columns editor-columns--empty">
        <div className="editor-columns__empty-state">
          <p>No editor columns</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="editor-columns"
      style={{
        display: 'flex',
        flexDirection: 'row',
        flex: 1,
        overflow: 'hidden',
      }}
    >
      {columns.map((column, index) => {
        const isActive = column.id === activeColumnId
        const isLastColumn = index === columns.length - 1

        return (
          <div
            key={column.id}
            className={`editor-column${isActive ? ' editor-column--active' : ''}`}
            style={{
              flex: column.splitRatio ?? 1,
              minWidth: `${MIN_COLUMN_WIDTH}px`,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Column content */}
            <div className="editor-column__content">
              {children(column)}
            </div>

            {/* Divider (except after last column) */}
            {!isLastColumn && (
              <div
                className="editor-divider"
                onMouseDown={(e) => handleDividerMouseDown(e, index)}
                onDoubleClick={(e) => handleDividerDoubleClick(e, index)}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize column"
                tabIndex={0}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
