/**
 * diff-engine — Line-by-line diff computation for AITerminal.
 *
 * Uses a Longest Common Subsequence (LCS) algorithm to produce
 * a minimal diff between two strings, split by newlines.
 */

import type { DiffLine, FileDiff } from '@/types/diff'

// ---------------------------------------------------------------------------
// LCS-based diff
// ---------------------------------------------------------------------------

/**
 * Compute the LCS table for two arrays of strings.
 * Returns a 2D array where lcs[i][j] is the length of the LCS
 * of oldLines[0..i-1] and newLines[0..j-1].
 */
function buildLcsTable(
  oldLines: ReadonlyArray<string>,
  newLines: ReadonlyArray<string>,
): ReadonlyArray<ReadonlyArray<number>> {
  const m = oldLines.length
  const n = newLines.length
  const table: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  )

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1])
      }
    }
  }

  return table
}

/**
 * Backtrack through the LCS table to produce a sequence of DiffLines.
 */
function backtrackDiff(
  oldLines: ReadonlyArray<string>,
  newLines: ReadonlyArray<string>,
  table: ReadonlyArray<ReadonlyArray<number>>,
): ReadonlyArray<DiffLine> {
  const result: DiffLine[] = []
  let i = oldLines.length
  let j = newLines.length
  // Line numbers are tracked via i/j indices directly

  // Build in reverse, then flip
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({
        type: 'unchanged',
        content: oldLines[i - 1],
        oldLineNum: i,
        newLineNum: j,
      })
      i--
      j--
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      result.push({
        type: 'added',
        content: newLines[j - 1],
        oldLineNum: null,
        newLineNum: j,
      })
      j--
    } else if (i > 0) {
      result.push({
        type: 'removed',
        content: oldLines[i - 1],
        oldLineNum: i,
        newLineNum: null,
      })
      i--
    }
  }

  return result.reverse()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a line-by-line diff between two content strings.
 * Returns an array of DiffLine objects with type, content, and line numbers.
 */
export function computeDiff(
  oldContent: string,
  newContent: string,
): ReadonlyArray<DiffLine> {
  const oldLines = oldContent.length === 0 ? [] : oldContent.split('\n')
  const newLines = newContent.length === 0 ? [] : newContent.split('\n')

  if (oldLines.length === 0 && newLines.length === 0) {
    return []
  }

  const table = buildLcsTable(oldLines, newLines)
  return backtrackDiff(oldLines, newLines, table)
}

/**
 * Create a FileDiff from a file path and old/new content strings.
 * Includes computed diff lines and addition/deletion counts.
 */
export function createFileDiff(
  filePath: string,
  oldContent: string,
  newContent: string,
): FileDiff {
  const lines = computeDiff(oldContent, newContent)
  const additions = lines.filter((l) => l.type === 'added').length
  const deletions = lines.filter((l) => l.type === 'removed').length

  return {
    filePath,
    oldContent,
    newContent,
    lines,
    additions,
    deletions,
  }
}

// ---------------------------------------------------------------------------
// AI response parsing
// ---------------------------------------------------------------------------

/**
 * Regex to find <<<BEFORE>>>...<<<AFTER>>>...<<<END>>> blocks.
 * Optionally preceded by a "File: <path>" line.
 */
const DIFF_BLOCK_RE =
  /(?:File:\s*(.+?)\n)?<<<BEFORE>>>\n([\s\S]*?)<<<AFTER>>>\n([\s\S]*?)<<<END>>>/g

/**
 * Parse diff markers from an AI response.
 * Returns an array of FileDiff objects, or null if no markers are found.
 *
 * Expected format:
 *   File: src/path.ts
 *   <<<BEFORE>>>
 *   old content
 *   <<<AFTER>>>
 *   new content
 *   <<<END>>>
 */
export function parseDiffFromAI(
  content: string,
): ReadonlyArray<FileDiff> | null {
  const results: FileDiff[] = []
  let match: RegExpExecArray | null

  // Reset lastIndex for safety
  DIFF_BLOCK_RE.lastIndex = 0

  while ((match = DIFF_BLOCK_RE.exec(content)) !== null) {
    const filePath = match[1]?.trim() || 'unknown'
    const oldContent = match[2].trimEnd()
    const newContent = match[3].trimEnd()

    results.push(createFileDiff(filePath, oldContent, newContent))
  }

  return results.length > 0 ? results : null
}

/**
 * Apply a diff by returning the new content string.
 * In a full implementation this would write to the filesystem via IPC;
 * here it simply returns the newContent from the FileDiff.
 */
export function applyDiff(fileDiff: FileDiff): string {
  return fileDiff.newContent
}
