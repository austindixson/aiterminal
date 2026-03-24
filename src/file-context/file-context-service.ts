/**
 * File Context Service — extracts @mentions, loads file content,
 * builds AI context blocks, and provides fuzzy file search.
 *
 * Used by the chat sidebar and Cmd+K to attach files to AI prompts.
 */

import type { FileContext, MentionMatch, FilePickerResult } from '@/types/file-context'
import type { FileEntry } from '@/types/file-tree'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MENTION_REGEX = /@([\w.\-/]+)/g
const DEFAULT_MAX_CHARS = 8000
const MAX_SEARCH_RESULTS = 10

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const EXTENSION_LANGUAGE_MAP: Readonly<Record<string, string>> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.svg': 'xml',
  '.env': 'plaintext',
}

function detectLanguage(filePath: string): string {
  const dotIndex = filePath.lastIndexOf('.')
  if (dotIndex === -1) return 'plaintext'

  const ext = filePath.slice(dotIndex).toLowerCase()
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'plaintext'
}

function getFileName(filePath: string): string {
  const slashIndex = filePath.lastIndexOf('/')
  return slashIndex === -1 ? filePath : filePath.slice(slashIndex + 1)
}

// ---------------------------------------------------------------------------
// extractMentions
// ---------------------------------------------------------------------------

/**
 * Finds all @mentions in text and returns structured match objects.
 *
 * Regex: /@([\w.\-/]+)/g — captures word chars, dots, hyphens, slashes.
 */
export function extractMentions(text: string): ReadonlyArray<MentionMatch> {
  const matches: MentionMatch[] = []
  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags)

  let match: RegExpExecArray | null = null
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      raw: match[0],
      path: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    })
  }

  return matches
}

// ---------------------------------------------------------------------------
// loadFileContext
// ---------------------------------------------------------------------------

/**
 * Loads a file's content via the Electron IPC bridge.
 * Truncates at maxChars if the content exceeds the limit.
 * Returns an error-shaped FileContext on failure.
 */
export async function loadFileContext(
  filePath: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): Promise<FileContext> {
  try {
    const { content } = await window.electronAPI.readFile(filePath)
    const truncated = content.length > maxChars
    const finalContent = truncated ? content.slice(0, maxChars) : content

    return {
      path: filePath,
      name: getFileName(filePath),
      content: finalContent,
      language: detectLanguage(filePath),
      truncated,
      charCount: content.length,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error reading file'
    return {
      path: filePath,
      name: getFileName(filePath),
      content: `Error loading file: ${message}`,
      language: 'plaintext',
      truncated: false,
      charCount: 0,
    }
  }
}

// ---------------------------------------------------------------------------
// buildContextBlock
// ---------------------------------------------------------------------------

/**
 * Formats an array of FileContext objects into a single string block
 * suitable for inclusion in an AI prompt.
 *
 * Each file is wrapped in a fenced code block with its path as the label.
 */
export function buildContextBlock(
  contexts: ReadonlyArray<FileContext>,
): string {
  if (contexts.length === 0) return ''

  return contexts
    .map((ctx) => {
      const truncatedNote = ctx.truncated
        ? ` (truncated from ${ctx.charCount} chars)`
        : ''
      const header = `[${ctx.name} — ${ctx.charCount} chars${truncatedNote}]`
      return `${header}\n\`\`\`${ctx.path}\n${ctx.content}\n\`\`\``
    })
    .join('\n\n')
}

// ---------------------------------------------------------------------------
// searchFiles
// ---------------------------------------------------------------------------

/**
 * Flattens a file tree into a list of FilePickerResult objects.
 */
function flattenTree(
  entries: ReadonlyArray<FileEntry>,
  cwd: string,
): FilePickerResult[] {
  const results: FilePickerResult[] = []

  function walk(nodes: ReadonlyArray<FileEntry>): void {
    for (const node of nodes) {
      const relativePath = node.path.startsWith(cwd)
        ? node.path.slice(cwd.length + 1)
        : node.path

      results.push({
        path: node.path,
        name: node.name,
        relativePath,
        isDirectory: node.isDirectory,
      })

      if (node.children) {
        walk(node.children)
      }
    }
  }

  walk(entries)
  return results
}

/**
 * Computes a simple fuzzy relevance score for a file against a query.
 * Higher score = better match.
 */
function computeRelevance(file: FilePickerResult, queryLower: string): number {
  const nameLower = file.name.toLowerCase()
  const pathLower = file.relativePath.toLowerCase()

  // Exact name match
  if (nameLower === queryLower) return 100

  // Name starts with query
  if (nameLower.startsWith(queryLower)) return 80

  // Name contains query
  if (nameLower.includes(queryLower)) return 60

  // Path contains query
  if (pathLower.includes(queryLower)) return 40

  return 0
}

/**
 * Searches the project file tree for files matching the query.
 * Uses the Electron IPC bridge to read the directory tree,
 * then performs fuzzy matching and sorting.
 */
export async function searchFiles(
  query: string,
  cwd: string,
): Promise<ReadonlyArray<FilePickerResult>> {
  const tree = await window.electronAPI.readDirectoryTree(cwd, 4)
  const allFiles = flattenTree(tree, cwd)

  if (query.length === 0) {
    // Return first MAX_SEARCH_RESULTS files when query is empty
    return allFiles.slice(0, MAX_SEARCH_RESULTS)
  }

  const queryLower = query.toLowerCase()

  const scored = allFiles
    .map((file) => ({
      file,
      score: computeRelevance(file, queryLower),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SEARCH_RESULTS)

  return scored.map((entry) => entry.file)
}

// ---------------------------------------------------------------------------
// replaceMentionsWithContext
// ---------------------------------------------------------------------------

/**
 * Replaces @path mentions in text with "[filename attached]" indicators
 * for any mention whose path matches a loaded FileContext.
 * Unmatched mentions are left as-is.
 */
export function replaceMentionsWithContext(
  text: string,
  contexts: ReadonlyArray<FileContext>,
): string {
  const contextMap = new Map(contexts.map((ctx) => [ctx.path, ctx]))

  return text.replace(
    new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags),
    (raw, path: string) => {
      const ctx = contextMap.get(path)
      return ctx ? `[${ctx.name} attached]` : raw
    },
  )
}
